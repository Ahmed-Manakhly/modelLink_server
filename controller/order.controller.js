const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const Stripe = require("stripe");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS, parseCommaSeparatedFilter } = require("../utils/normalizeFilterQuery");
const { generateOrderOptions } = require("../utils/ApiFeaturesHelpersForOrders");
const { publicUserFields } = require('../utils/ApiFeaturesHelpersForUsers');
const logger = require("../utils/logger");
const getPlatformFee = require("../utils/getPlatformFee");
const { createAndEmitNotification, notifyOrderClientAndDeveloper } = require("../utils/createAndEmitNotification");
const { orderLinkForRole } = require("../utils/notificationLinks");
const { useMockPayments, isMockWebhookAllowed } = require("../utils/marketplaceDemo");

const orderPartyContactFields = {
    id: true,
    org_username: true,
    avatar: true,
    first_name: true,
    role: true,
    createdAt: true,
    country: true,
    email: true,
    org_phone: true,
    isVerified: true,
};

// Helper function to handle atomic order payment success and wallet deposits
async function fulfillOrder(orderId, paymentIntentId, stripeEventId = null, io = null) {
    const eventId = stripeEventId || `evt_mock_${Date.now()}`;
    let newlyPaid = false;

    const updatedOrder = await prisma.$transaction(async (tx) => {
        let order;
        try {
            // Enforce update only if status is PENDING inside the transaction context
            order = await tx.order.update({
                where: { id: orderId, status: 'PENDING' },
                data: { status: 'PAID' }
            });
            newlyPaid = true;
        } catch (err) {
            logger.info('Order already fulfilled/processed or not found in transaction', { orderId });
            const currentOrder = await tx.order.findUnique({ where: { id: orderId } });
            return currentOrder;
        }

        const purchasePrice = order.purchasePrice;
        const feeValue = await getPlatformFee();
        const platformFee = Math.round(purchasePrice * feeValue / 100);
        const developerPayout = purchasePrice - platformFee;

        // 2. Create platform Transaction record
        await tx.transaction.create({
            data: {
                stripeEventId: eventId,
                grossAmount: purchasePrice,
                platformFee,
                developerPayout,
                currency: 'usd',
                orderId: order.id
            }
        });

        // 3. Find or create Developer Wallet
        let wallet = await tx.wallet.findUnique({
            where: { userId: order.developerId }
        });

        if (!wallet) {
            wallet = await tx.wallet.create({
                data: { userId: order.developerId }
            });
        }

        // 4. Update Developer Wallet: add funds to pending balance
        await tx.wallet.update({
            where: { id: wallet.id },
            data: {
                pendingBalance: { increment: developerPayout }
            }
        });

        // 5. Create WalletTransaction (type: SALE)
        await tx.walletTransaction.create({
            data: {
                type: 'SALE',
                amount: developerPayout,
                description: `Sale of AI Model: ${order.title}`,
                referenceId: paymentIntentId,
                referenceType: 'STRIPE_PAYMENT_INTENT',
                walletId: wallet.id,
                orderId: order.id
            }
        });

        // 6. Update Developer total orders count
        await tx.user.update({
            where: { id: order.developerId },
            data: {
                total_orders: { increment: 1 }
            }
        });

        // 7. Increment sales count on the AiModel
        await tx.aiModel.update({
            where: { id: order.aiModelId },
            data: {
                sales: { increment: 1 }
            }
        });

        logger.info('Order payment successfully fulfilled via transaction', { orderId: order.id, platformFee, developerPayout });
        return order;
    });

    if (newlyPaid && updatedOrder && io) {
        await createAndEmitNotification({
            actionDesc: `New paid order #${updatedOrder.id} — ${updatedOrder.title} — ready for delivery`,
            type: 'ORDER',
            recipientId: updatedOrder.developerId,
            senderId: updatedOrder.clientId,
            actionLink: orderLinkForRole('DEVELOPER', updatedOrder.id),
            unRead: true,
        }, io);
    }

    return updatedOrder;
}

// Helper function to handle marking an order as delivered, clearing funds to available balance
async function deliverOrder(orderId) {
    return await prisma.$transaction(async (tx) => {
        let updatedOrder;
        try {
            // Update only if status is PAID inside the transaction block
            updatedOrder = await tx.order.update({
                where: { id: orderId, status: 'PAID' },
                data: { status: 'DELIVERED' }
            });
        } catch (err) {
            logger.info('Order already delivered or not found in transaction', { orderId });
            const currentOrder = await tx.order.findUnique({ where: { id: orderId } });
            return currentOrder;
        }

        const feeValue = await getPlatformFee();
        const platformFee = Math.round(updatedOrder.purchasePrice * feeValue / 100);
        const developerPayout = updatedOrder.purchasePrice - platformFee;

        // Find Developer Wallet
        const wallet = await tx.wallet.findUnique({
            where: { userId: updatedOrder.developerId }
        });

        if (wallet) {
            // Move pending balance to available balance
            await tx.wallet.update({
                where: { id: wallet.id },
                data: {
                    pendingBalance: { decrement: developerPayout },
                    availableBalance: { increment: developerPayout },
                    totalEarnings: { increment: developerPayout }
                }
            });
        }

        logger.info('Order status transitioned to DELIVERED. Funds cleared to developer available balance.', { orderId });
        return updatedOrder;
    });
}

exports.getAllOrders = asyncErrorCatching(async (req, res, next) => {
    let specificAiModelId = null;
    if (req.query.aiModelId) {
        specificAiModelId = parseInt(req.query.aiModelId, 10);
        delete req.query.aiModelId;
    }

    const orderQuery = normalizeFilterQuery(req.query, FILTER_SPECS.order);
    parseCommaSeparatedFilter(orderQuery, 'status');

    if (orderQuery.status) {
        const validStatuses = ['PENDING', 'PAID', 'DELIVERED', 'DISPUTED', 'REFUNDED', 'CANCELLED'];
        if (orderQuery.status.in) {
            const filteredStatuses = orderQuery.status.in.filter(s => validStatuses.includes(s));
            if (filteredStatuses.length === 0) {
                delete orderQuery.status;
            } else {
                orderQuery.status.in = filteredStatuses;
            }
        } else if (typeof orderQuery.status === 'string') {
            if (!validStatuses.includes(orderQuery.status)) {
                delete orderQuery.status;
            }
        }
    }

    const queryBuilder = new ApiFeatures(
        prisma.order,
        orderQuery,
        generateOrderOptions()
    );

    if (req.user.role === "CLIENT") {
        queryBuilder.query.where.AND.push({ clientId: req.user.id });
    } else if (req.user.role === "DEVELOPER") {
        queryBuilder.query.where.AND.push({ developerId: req.user.id });
    }

    if (specificAiModelId && !isNaN(specificAiModelId)) {
        queryBuilder.query.where.AND.push({ aiModelId: specificAiModelId });
    }

    const { data: orders, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get all orders', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "getAllOrders",
        outcome: "Success",
        orderCount: orders.length
    }, "User successfully retrieved orders");

    res.status(200).json({
        status: "success",
        pagination,
        data: {
            orders,
        },
    });
});

exports.getOrder = asyncErrorCatching(async (req, res, next) => {
    const orderId = parseInt(req.params.id, 10);
    const filter = { id: orderId };

    if (req.user.role === "CLIENT") {
        filter.clientId = req.user.id;
    } else if (req.user.role === "DEVELOPER") {
        filter.developerId = req.user.id;
    }

    const isPlatformAdmin = req.user.role === 'ADMIN' || req.user.role === 'EMPLOYEE';
    const orderInclude = {
        User_Order_clientIdToUser: {
            select: orderPartyContactFields,
        },
        User_Order_developerIdToUser: {
            select: orderPartyContactFields,
        },
        AiModel: true,
        AiModelVersion: {
            select: { id: true, version: true, price: true },
        },
        dispute: {
            include: {
                openedBy: {
                    select: {
                        org_username: true,
                        first_name: true,
                        last_name: true,
                        email: true,
                    },
                },
            },
        },
    };
    if (isPlatformAdmin) {
        orderInclude.transaction = {
            select: {
                grossAmount: true,
                platformFee: true,
                developerPayout: true,
                currency: true,
            },
        };
    }

    const order = await prisma.order.findFirst({
        where: filter,
        include: orderInclude,
    });

    if (!order) {
        logger.warn('Order not found', { orderId, userId: req.user.id, requestId: req.id });
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }

    order.clientData = order.User_Order_clientIdToUser || null;
    order.developerData = order.User_Order_developerIdToUser || null;
    order.aiModelData = order.AiModel || null;
    order.versionData = order.AiModelVersion || null;

    delete order.User_Order_clientIdToUser;
    delete order.User_Order_developerIdToUser;
    delete order.AiModel;
    delete order.AiModelVersion;

    // Securely deliver decrypted asset parameters only when Order is PAID or DELIVERED
    if (order.status === 'PAID' || order.status === 'DELIVERED') {
        const isBuyer = order.clientId === req.user.id;
        const isSeller = order.developerId === req.user.id;
        const isAdmin = req.user.role === 'ADMIN' || req.user.role === 'EMPLOYEE';

        if (isBuyer || isSeller || isAdmin) {
            const assets = await prisma.modelAsset.findMany({
                where: { versionId: order.versionId }
            });
            const { decrypt, generatePresignedUrl } = require('../utils/crypto');
            order.decryptedAssets = assets.map(asset => {
                if (asset.type === 'DOWNLOAD_LINK' || asset.type === 'API_ENDPOINT') {
                    return {
                        id: asset.id,
                        type: asset.type,
                        downloadUrl: generatePresignedUrl(order.id, asset.id, 15)
                    };
                }
                return {
                    id: asset.id,
                    type: asset.type,
                    value: decrypt(asset.encryptedValue)
                };
            });
        }
    }

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "getOrder",
        outcome: "Success",
        orderId: order.id
    }, "User successfully retrieved order details");

    res.status(200).json({
        status: "success",
        data: {
            order,
        },
    });
});

exports.createOrderIntent = asyncErrorCatching(async (req, res, next) => {
    let versionId = req.body.versionId ? parseInt(req.body.versionId, 10) : null;
    let aiModelId = req.body.aiModelId || req.body.id ? parseInt(req.body.aiModelId || req.body.id, 10) : null;

    if (versionId !== null && isNaN(versionId)) return next(new createError(400, "Invalid version ID."));
    if (aiModelId !== null && isNaN(aiModelId)) return next(new createError(400, "Invalid AI model ID."));

    let version = null;
    let aiModel = null;

    // Fetch Version and Model
    if (versionId) {
        version = await prisma.aiModelVersion.findUnique({
            where: { id: versionId },
            include: { aiModel: true }
        });
        if (version) {
            aiModel = version.aiModel;
        }
    } else if (aiModelId) {
        aiModel = await prisma.aiModel.findUnique({
            where: { id: aiModelId },
            include: {
                versions: {
                    where: { isPrimary: true }
                }
            }
        });
        if (aiModel && aiModel.versions.length > 0) {
            version = aiModel.versions[0];
            versionId = version.id;
        }
    }

    if (!version || !aiModel) {
        logger.error('Failed to create order intent: model or version not found', { versionId, aiModelId, requestId: req.id });
        return next(new createError(404, "AI Model or Model Version not found."));
    }

    if (aiModel.status !== 'PUBLISHED') {
        return next(new createError(400, "Cannot purchase a model that is not published."));
    }

    if (!version.isActive) {
        return next(new createError(400, "Cannot purchase an inactive model version."));
    }

    if (req.user.role === "DEVELOPER") {
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_ORDER));
    }

    if (aiModel.developerId === req.user.id) {
        return next(new createError(400, "You cannot purchase your own AI Model."));
    }

    let paymentIntent = null;
    let clientSecret = null;

    // Stripe integration — real intents only in production when demo mode is off
    if (process.env.STRIPE && !useMockPayments()) {
        try {
            const stripe = new Stripe(process.env.STRIPE);
            paymentIntent = await stripe.paymentIntents.create({
                amount: version.price * 100, // Stripe expects amount in cents
                currency: "usd",
                automatic_payment_methods: {
                    enabled: true,
                },
                metadata: {
                    clientId: req.user.id,
                    developerId: aiModel.developerId,
                    aiModelId: aiModel.id,
                    versionId: version.id
                }
            });
            clientSecret = paymentIntent.client_secret;
        } catch (err) {
            logger.error('Stripe payment intent creation failed', { error: err.message, requestId: req.id });
            return next(new createError(500, "Stripe integration failure."));
        }
    } else {
        // Mock payment intent for development testing environment
        paymentIntent = {
            id: `mock_pi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            client_secret: `mock_secret_${Date.now()}`
        };
        clientSecret = paymentIntent.client_secret;
    }

    // Create a pending Order entry linked to the version
    const order = await prisma.order.create({
        data: {
            aiModelId: aiModel.id,
            versionId: version.id,
            purchasePrice: version.price,
            img: aiModel.galleryImages?.[0] || 'default-cover.png',
            title: aiModel.title,
            clientId: req.user.id,
            developerId: aiModel.developerId,
            stripePaymentIntentId: paymentIntent.id,
            status: 'PENDING'
        },
    });

    const io = req.app.get('io');
    await createAndEmitNotification({
        actionDesc: 'You have a new order! Awaiting client payment.',
        type: 'ORDER',
        recipientId: aiModel.developerId,
        senderId: req.user.id,
        actionLink: orderLinkForRole('DEVELOPER', order.id),
    }, io);
    await createAndEmitNotification({
        actionDesc: 'Your order was created. Complete payment to confirm your purchase.',
        type: 'ORDER',
        recipientId: req.user.id,
        senderId: aiModel.developerId,
        actionLink: orderLinkForRole('CLIENT', order.id),
    }, io);

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "createOrderIntent",
        outcome: "Success",
        orderId: order.id
    }, "User successfully created order Intent");

    res.status(200).send({
        status: "success",
        clientSecret,
        data: {
            order,
        },
    });
});

exports.confirmOrder = asyncErrorCatching(async (req, res, next) => {
    const orderId = parseInt(req.params.id, 10);

    if (isNaN(orderId)) {
        return next(new createError(400, "Invalid order ID."));
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId },
    });

    if (!order) {
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }

    const isOrderClient = order.clientId === req.user.id;
    const isOrderDeveloper = order.developerId === req.user.id;
    const isPlatformAdmin = req.user.role === 'ADMIN' || req.user.role === 'EMPLOYEE';

    if (!isOrderClient && !isOrderDeveloper && !isPlatformAdmin) {
        logger.warn('Order confirmation failed: Unauthorized user', { orderId, userId: req.user.id, role: req.user.role });
        return next(new createError(403, "You are not authorized to confirm this order."));
    }

    if (order.status === 'PENDING') {
        return next(new createError(400, "Order must be paid before delivery can be confirmed."));
    }

    const currentOrder = await prisma.order.findUnique({ where: { id: order.id } });

    if (currentOrder.status === 'DELIVERED') {
        return next(new createError(400, "Order is already marked as delivered/completed."));
    }

    // Deliver order (marks as DELIVERED and transfers pending funds to developer available wallet balance)
    const updatedOrder = await deliverOrder(order.id);

    const recipientId = isOrderClient ? order.developerId : order.clientId;
    const confirmerLabel = isOrderClient ? 'client' : 'developer';
    const recipientRole = isOrderClient ? 'DEVELOPER' : 'CLIENT';
    await createAndEmitNotification({
        actionDesc: `Order #${order.id} was confirmed as delivered by the ${confirmerLabel}.`,
        type: 'ORDER',
        recipientId,
        senderId: req.user.id,
        actionLink: orderLinkForRole(recipientRole, order.id),
        unRead: true,
    }, req.app.get('io'));

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "confirmOrder",
        outcome: "Success",
        orderId: order.id
    }, "User successfully confirmed/marked order as delivered");

    res.status(200).send({
        status: "success",
        data: {
            order: updatedOrder
        },
    });
});

exports.deleteOrder = asyncErrorCatching(async (req, res, next) => {
    // Restrict deletion to platform admins
    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const order = await prisma.order.findUnique({
        where: {
            id: parseInt(req.params.id, 10),
        },
    });

    if (!order) {
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }

    if (order.status !== 'PENDING') {
        logger.error('Attempted to delete a processed order', { orderId: order.id, status: order.status });
        return next(new createError(400, "Cannot delete orders that have already been paid or processed."));
    }

    await prisma.order.delete({
        where: {
            id: order.id,
        },
    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "deleteOrder",
        outcome: "Success",
        orderId: order.id
    }, "Admin successfully deleted order");

    res.status(204).json({
        status: "success",
        data: null
    });
});

exports.stripeWebhook = asyncErrorCatching(async (req, res, next) => {
    const sig = req.headers['stripe-signature'];
    let event = req.body;
    let webhookEvent = null;

    if (process.env.STRIPE && process.env.STRIPE_WEBHOOK_SECRET && sig) {
        try {
            const stripe = new Stripe(process.env.STRIPE);
            event = stripe.webhooks.constructEvent(req.rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
        } catch (err) {
            logger.error('Webhook signature verification failed', { error: err.message });
            return res.status(400).send(`Webhook Signature Verification Error: ${err.message}`);
        }
    } else if (!isMockWebhookAllowed()) {
        logger.error('Stripe webhook received but env keys are missing in production environment');
        return res.status(400).send('Webhook configuration error: STRIPE_WEBHOOK_SECRET is required.');
    }

    logger.info('Stripe Webhook Event Received', { eventType: event.type, eventId: event.id });

    if (event.id) {
        const existingEvent = await prisma.webhookEvent.findUnique({
            where: { eventId: event.id }
        });

        if (existingEvent?.status === 'PROCESSED') {
            logger.info('Stripe Webhook duplicate event skipped', { eventId: event.id });
            return res.status(200).json({ received: true });
        }

        webhookEvent = await prisma.webhookEvent.upsert({
            where: { eventId: event.id },
            update: {
                retryCount: { increment: 1 },
                rawPayload: event,
                status: 'RECEIVED',
                failureReason: null,
                processedAt: null
            },
            create: {
                eventId: event.id,
                eventType: event.type,
                rawPayload: event,
                status: 'RECEIVED'
            }
        });

        // Create an audit log entry for received webhook (guarded)
        try {
            const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
            if (adminUser) {
                await prisma.auditLog.create({
                    data: {
                        actionType: 'STRIPE_WEBHOOK_RECEIVED',
                        targetId: event.id,
                        reason: JSON.stringify({ eventType: event.type || null }),
                        adminId: adminUser.id
                    }
                });
            }
        } catch (e) {
            logger.warn('Failed to create audit log for webhook receipt', { error: e.message });
        }
    }

    try {
        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object;
            const paymentIntentId = paymentIntent.id;

            // Find corresponding Order record
            const order = await prisma.order.findFirst({
                where: { stripePaymentIntentId: paymentIntentId }
            });

            if (order) {
                await fulfillOrder(order.id, paymentIntentId, event.id, req.app.get('io'));

                // Record processing audit entry (guarded)
                try {
                    const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
                    if (adminUser) {
                        await prisma.auditLog.create({
                            data: {
                                actionType: 'STRIPE_WEBHOOK_PROCESSED',
                                targetId: event.id,
                                reason: JSON.stringify({ processed: true, orderId: order.id }),
                                adminId: adminUser.id
                            }
                        });
                    }
                } catch (e) {
                    logger.warn('Failed to create audit log for webhook processing', { error: e.message });
                }
            } else {
                logger.warn('Order not found for succeeded payment intent ID', { paymentIntentId });
            }
        } else if (event.type === 'account.updated') {
            const account = event.data.object;
            const stripeAccountId = account.id;
            const chargesEnabled = account.charges_enabled;
            const detailsSubmitted = account.details_submitted;

            const user = await prisma.user.findFirst({
                where: { stripeAccountId }
            });

            if (user) {
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        stripeChargesEnabled: chargesEnabled,
                        stripeDetailsSubmitted: detailsSubmitted
                    }
                });
                logger.info('Stripe Connected Account updated details successfully', { stripeAccountId, chargesEnabled, detailsSubmitted });
            } else {
                logger.warn('User not found for Stripe Connect account updated event', { stripeAccountId });
            }
        }

        if (webhookEvent) {
            await prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: {
                    status: 'PROCESSED',
                    processedAt: new Date()
                }
            });
        }
    } catch (err) {
        if (webhookEvent) {
            await prisma.webhookEvent.update({
                where: { id: webhookEvent.id },
                data: {
                    status: 'FAILED',
                    failureReason: err.message,
                    processedAt: new Date()
                }
            });
        }
        throw err;
    }

    res.status(200).json({ received: true });
});

exports.downloadAsset = asyncErrorCatching(async (req, res, next) => {
    const orderId = parseInt(req.params.id, 10);
    const assetId = parseInt(req.params.assetId, 10);
    const { expires, signature } = req.query;

    if (isNaN(orderId) || isNaN(assetId)) {
        return next(new createError(400, "Invalid order ID or asset ID."));
    }

    // Check order existence and ownership
    const order = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        return next(new createError(404, "Order not found."));
    }

    if (order.clientId !== req.user.id && order.developerId !== req.user.id && req.user.role !== 'ADMIN' && req.user.role !== 'EMPLOYEE') {
        logger.error('Asset download failed: Unauthorized user', { orderId, assetId, userId: req.user.id });
        return next(new createError(403, "You are not authorized to download this asset."));
    }

    if (order.status !== 'PAID' && order.status !== 'DELIVERED') {
        logger.error('Asset download failed: Order is not paid or delivered', { orderId, assetId, status: order.status });
        return next(new createError(403, "Assets are only available for paid or delivered orders."));
    }

    const { verifyPresignedUrl, decrypt } = require('../utils/crypto');

    // 1. Verify the presigned URL signature and expiry
    if (!verifyPresignedUrl(orderId, assetId, expires, signature)) {
        logger.error('Asset download failed: Signature invalid or expired', { orderId, assetId, expires });
        return next(new createError(403, "This download link is invalid or has expired. Please request a new link."));
    }

    // 2. Fetch the asset
    const asset = await prisma.modelAsset.findUnique({
        where: { id: assetId }
    });

    if (!asset) {
        return next(new createError(404, "Asset not found."));
    }

    if (asset.versionId !== order.versionId) {
        logger.error('Asset download failed: Asset does not belong to order version', {
            orderId,
            assetId,
            orderVersionId: order.versionId,
            assetVersionId: asset.versionId
        });
        return next(new createError(403, "You are not authorized to download this asset for this order."));
    }

    const decryptedValue = decrypt(asset.encryptedValue);
    if (!decryptedValue) {
        return next(new createError(500, "Failed to retrieve the asset value."));
    }

    logger.info('Asset downloaded successfully via presigned link', { orderId, assetId, assetType: asset.type });

    // 3. If external URL or download link, redirect
    if (asset.type === 'DOWNLOAD_LINK' || asset.type === 'API_ENDPOINT') {
        // Check if file is stored locally in public folder
        const path = require('path');
        const fs = require('fs');
        const publicDir = process.env.PUBLIC_DIR;

        if (publicDir) {
            const localFilePath = path.join(publicDir, decryptedValue);
            if (fs.existsSync(localFilePath) && fs.lstatSync(localFilePath).isFile()) {
                return res.download(localFilePath);
            }
        }

        // Otherwise redirect to external link/URL
        return res.redirect(decryptedValue);
    }

    // Default response if type is something else (e.g. docker image tag name)
    res.status(200).json({
        status: "success",
        type: asset.type,
        value: decryptedValue
    });
});

exports.cancelOrder = asyncErrorCatching(async (req, res, next) => {
    const orderId = parseInt(req.params.id, 10);

    const order = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }

    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE" &&
        req.user.id !== order.clientId && req.user.id !== order.developerId) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    if (order.status === 'CANCELLED' || order.status === 'REFUNDED') {
        return next(new createError(400, "Order is already cancelled or refunded."));
    }

    if (order.status === 'DELIVERED') {
        return next(new createError(400, "Cannot cancel a delivered order. Use refund instead."));
    }

    const feeValue = await getPlatformFee();
    const platformFee = Math.round(order.purchasePrice * feeValue / 100);
    const developerPayout = order.purchasePrice - platformFee;

    const updatedOrder = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
            where: { id: orderId, status: order.status },
            data: { status: 'CANCELLED' }
        });

        if (order.status === 'PAID') {
            const wallet = await tx.wallet.findUnique({
                where: { userId: order.developerId }
            });

            if (wallet) {
                let pendingDecrement = 0;
                let availableDecrement = 0;

                if (wallet.pendingBalance >= developerPayout) {
                    pendingDecrement = developerPayout;
                } else {
                    pendingDecrement = wallet.pendingBalance;
                    availableDecrement = developerPayout - wallet.pendingBalance;
                }

                await tx.wallet.update({
                    where: { id: wallet.id },
                    data: {
                        pendingBalance: { decrement: pendingDecrement },
                        availableBalance: { decrement: availableDecrement }
                    }
                });

                await tx.walletTransaction.create({
                    data: {
                        type: 'REFUND',
                        amount: -developerPayout,
                        description: `Order cancellation and refund: ${order.title}`,
                        referenceId: order.stripePaymentIntentId,
                        referenceType: 'STRIPE_PAYMENT_INTENT',
                        walletId: wallet.id,
                        orderId: order.id
                    }
                });
            }
        }

        return updated;
    });

    logger.info({
        userid: req.user.id,
        userRole: req.user.role,
        event: "cancelOrder",
        outcome: "Success",
        orderId: order.id
    }, "Order successfully cancelled");

    res.status(200).json({
        status: "success",
        data: { order: updatedOrder }
    });
});

exports.refundOrder = asyncErrorCatching(async (req, res, next) => {
    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const orderId = parseInt(req.params.id, 10);

    const order = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }

    if (order.status === 'REFUNDED' || order.status === 'CANCELLED') {
        return next(new createError(400, "Order is already refunded or cancelled."));
    }

    const feeValue = await getPlatformFee();
    const platformFee = Math.round(order.purchasePrice * feeValue / 100);
    const developerPayout = order.purchasePrice - platformFee;

    const updatedOrder = await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({
            where: { id: orderId, status: order.status },
            data: { status: 'REFUNDED' }
        });

        const wallet = await tx.wallet.findUnique({
            where: { userId: order.developerId }
        });

        if (wallet) {
            let pendingDecrement = 0;
            let availableDecrement = 0;

            if (order.status === 'DELIVERED') {
                if (wallet.availableBalance >= developerPayout) {
                    availableDecrement = developerPayout;
                } else {
                    availableDecrement = wallet.availableBalance;
                    pendingDecrement = developerPayout - wallet.availableBalance;
                }
            } else {
                if (wallet.pendingBalance >= developerPayout) {
                    pendingDecrement = developerPayout;
                } else {
                    pendingDecrement = wallet.pendingBalance;
                    availableDecrement = developerPayout - wallet.pendingBalance;
                }
            }

            await tx.wallet.update({
                where: { id: wallet.id },
                data: {
                    pendingBalance: { decrement: pendingDecrement },
                    availableBalance: { decrement: availableDecrement }
                }
            });

            await tx.walletTransaction.create({
                data: {
                    type: 'REFUND',
                    amount: -developerPayout,
                    description: `Admin order dispute refund: ${order.title}`,
                    referenceId: order.stripePaymentIntentId,
                    referenceType: 'STRIPE_PAYMENT_INTENT',
                    walletId: wallet.id,
                    orderId: order.id
                }
            });
        }

        return updated;
    });

    const orderLabel = order.title || `Order #${order.id}`;
    await notifyOrderClientAndDeveloper(req.app.get('io'), {
        senderId: req.user.id,
        order,
        clientMessage: `Your order "${orderLabel}" was refunded by admin.`,
        developerMessage: `Order "${orderLabel}" was refunded to the buyer by admin.`,
    });

    logger.info({
        userid: req.user.id,
        userRole: req.user.role,
        event: "refundOrder",
        outcome: "Success",
        orderId: order.id
    }, "Order successfully refunded by admin");

    res.status(200).json({
        status: "success",
        data: { order: updatedOrder }
    });
});
