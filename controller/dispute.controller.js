const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS } = require("../utils/normalizeFilterQuery");
const { generateDisputeOptions } = require("../utils/ApiFeaturesHelpersForDisputes");
const logger = require("../utils/logger");
const getPlatformFee = require("../utils/getPlatformFee");
const { notifyOrderClientAndDeveloper } = require("../utils/createAndEmitNotification");

const disputeOrderLabel = (order) => order?.title || `Order #${order?.id}`;

const disputeResolutionMessages = {
    REFUND_CLIENT: (label) => ({
        clientMessage: `Dispute resolved: "${label}" was refunded to you.`,
        developerMessage: `Dispute resolved: "${label}" was refunded to the buyer.`,
    }),
    RELEASE_TO_DEVELOPER: (label) => ({
        clientMessage: `Dispute resolved: "${label}" — resolved in favor of the developer.`,
        developerMessage: `Dispute resolved: "${label}" — payout released to you.`,
    }),
};

async function notifyDisputeParties(io, { senderId, order, clientMessage, developerMessage }) {
    await notifyOrderClientAndDeveloper(io, {
        senderId,
        order,
        clientMessage,
        developerMessage,
    });
}

// Client opens a dispute on an order
exports.createDispute = asyncErrorCatching(async (req, res, next) => {
    const orderId = parseInt(req.body.orderId, 10);
    const { reason } = req.body;

    if (isNaN(orderId) || !reason) {
        return next(new createError(400, "OrderId and dispute reason are required."));
    }

    const order = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        return next(new createError(404, "Order not found."));
    }

    if (order.clientId !== req.user.id) {
        return next(new createError(403, "You can only dispute orders you purchased."));
    }

    if (order.status !== 'PAID' && order.status !== 'DELIVERED') {
        return next(new createError(400, `Cannot dispute this order because its status is ${order.status}. Only Paid or Delivered orders can be disputed.`));
    }

    const existingDispute = await prisma.dispute.findUnique({
        where: { orderId },
    });
    if (existingDispute) {
        return next(new createError(409, 'A dispute already exists for this order.'));
    }

    const dispute = await prisma.$transaction(async (tx) => {
        // 1. Update order status to DISPUTED
        await tx.order.update({
            where: { id: orderId },
            data: { status: 'DISPUTED' }
        });

        // 2. Create Dispute record
        const newDispute = await tx.dispute.create({
            data: {
                orderId,
                reason,
                openedById: req.user.id,
                status: 'OPEN',
                previousOrderStatus: order.status
            }
        });

        return newDispute;
    });

    const label = disputeOrderLabel(order);
    await notifyDisputeParties(req.app.get('io'), {
        senderId: req.user.id,
        order,
        clientMessage: `You opened a dispute on "${label}". Admin will review your case.`,
        developerMessage: `The buyer opened a dispute on "${label}". Admin will review the case.`,
    });

    logger.info('Client successfully opened a dispute', { disputeId: dispute.id, orderId, clientId: req.user.id });
    res.status(201).json({
        status: "success",
        message: "Dispute opened successfully.",
        data: { dispute }
    });
});

// Get disputes (filtered by role constraints)
exports.getDisputes = asyncErrorCatching(async (req, res, next) => {
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.dispute);
    if (filterQuery.status && typeof filterQuery.status === 'string' && filterQuery.status.includes(',')) {
        filterQuery.status = { in: filterQuery.status.split(',').map(s => s.trim()) };
    }

    // Enforce role-based visibility rules
    if (req.user.role === 'CLIENT') {
        filterQuery.openedById = req.user.id;
    } else if (req.user.role === 'DEVELOPER') {
        // Find disputes where the order belongs to this developer
        filterQuery['order.developerId'] = req.user.id;
    }

    const queryBuilder = new ApiFeatures(
        prisma.dispute,
        filterQuery,
        generateDisputeOptions()
    );

    const { data: disputes, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { disputes }
    });
});

// Admin resolves dispute
exports.resolveDispute = asyncErrorCatching(async (req, res, next) => {
    const disputeId = parseInt(req.params.id, 10);
    const { resolution, notes } = req.body; // resolution: "REFUND_CLIENT" or "RELEASE_TO_DEVELOPER"

    if (!resolution || !notes) {
        return next(new createError(400, "Resolution decision (resolution) and explanation notes (notes) are required."));
    }

    const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: { order: true }
    });

    if (!dispute) {
        return next(new createError(404, "Dispute not found."));
    }

    if (dispute.status === 'RESOLVED' || dispute.status === 'REJECTED') {
        return next(new createError(400, "Dispute is already resolved."));
    }

    const order = dispute.order;
    const feeValue = await getPlatformFee();
    const platformFee = Math.round(order.purchasePrice * feeValue / 100);
    const developerPayout = order.purchasePrice - platformFee;

    const result = await prisma.$transaction(async (tx) => {
        if (resolution === 'REFUND_CLIENT') {
            // 1. Update order status to REFUNDED
            await tx.order.update({
                where: { id: order.id },
                data: { status: 'REFUNDED' }
            });

            // 2. Reclaim developer funds from wallet
            let wallet = await tx.wallet.findUnique({
                where: { userId: order.developerId }
            });

            if (wallet) {
                let pendingDecrement = 0;
                let availableDecrement = 0;

                // Adjust based on the state prior to dispute
                if (dispute.previousOrderStatus === 'DELIVERED') {
                    // Reclaim from available balance first
                    if (wallet.availableBalance >= developerPayout) {
                        availableDecrement = developerPayout;
                    } else {
                        availableDecrement = wallet.availableBalance;
                        pendingDecrement = developerPayout - wallet.availableBalance;
                    }
                } else {
                    // Reclaim from pending balance first
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

                // 3. Create wallet transaction record for refund/reversal
                await tx.walletTransaction.create({
                    data: {
                        type: 'REFUND',
                        amount: -developerPayout,
                        description: `Dispute Resolution: Client Refunded for Order ID ${order.id}`,
                        walletId: wallet.id,
                        orderId: order.id
                    }
                });
            }

            // 4. Update dispute status
            const updatedDispute = await tx.dispute.update({
                where: { id: disputeId },
                data: {
                    status: 'RESOLVED',
                    resolution: `REFUND_CLIENT: ${notes}`
                }
            });

            // 5. Create Audit Log
            await tx.auditLog.create({
                data: {
                    actionType: 'RESOLVE_DISPUTE_REFUND',
                    targetId: String(disputeId),
                    reason: notes,
                    adminId: req.user.id
                }
            });

            return updatedDispute;

        } else if (resolution === 'RELEASE_TO_DEVELOPER') {
            // 1. Update order status to DELIVERED (successful delivery)
            await tx.order.update({
                where: { id: order.id },
                data: { status: 'DELIVERED' }
            });

            // 2. Move developer funds from pending to available balance ONLY if it wasn't already delivered!
            if (dispute.previousOrderStatus !== 'DELIVERED') {
                let wallet = await tx.wallet.findUnique({
                    where: { userId: order.developerId }
                });

                if (wallet) {
                    await tx.wallet.update({
                        where: { id: wallet.id },
                        data: {
                            pendingBalance: { decrement: developerPayout },
                            availableBalance: { increment: developerPayout },
                            totalEarnings: { increment: developerPayout }
                        }
                    });
                }
            }

            // 3. Update dispute status
            const updatedDispute = await tx.dispute.update({
                where: { id: disputeId },
                data: {
                    status: 'RESOLVED',
                    resolution: `RELEASE_TO_DEVELOPER: ${notes}`
                }
            });

            // 4. Create Audit Log
            await tx.auditLog.create({
                data: {
                    actionType: 'RESOLVE_DISPUTE_RELEASE',
                    targetId: String(disputeId),
                    reason: notes,
                    adminId: req.user.id
                }
            });

            return updatedDispute;
        } else {
            throw new Error('Invalid resolution type. Must be REFUND_CLIENT or RELEASE_TO_DEVELOPER.');
        }
    });

    const orderLabel = disputeOrderLabel(order);
    const io = req.app.get('io');
    const messages = disputeResolutionMessages[resolution]?.(orderLabel);

    if (messages) {
        await notifyDisputeParties(io, {
            senderId: req.user.id,
            order,
            clientMessage: messages.clientMessage,
            developerMessage: messages.developerMessage,
        });
    }

    logger.info('Admin successfully resolved dispute', { disputeId, resolution, adminId: req.user.id });
    res.status(200).json({
        status: "success",
        message: "Dispute resolved successfully.",
        data: { dispute: result }
    });
});
