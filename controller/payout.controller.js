const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS } = require("../utils/normalizeFilterQuery");
const { generatePayoutOptions } = require("../utils/ApiFeaturesHelpersForPayouts");
const logger = require("../utils/logger");
const { createAndEmitNotification } = require("../utils/createAndEmitNotification");
const { walletLink } = require("../utils/notificationLinks");

const formatPayoutAmount = (amount) => Number(amount || 0).toFixed(2);

// Developer requests a payout (withdrawal)
exports.requestPayout = asyncErrorCatching(async (req, res, next) => {
    const amount = parseInt(req.body.amount, 10);
    const note = typeof req.body.note === 'string' ? req.body.note.trim() || null : null;

    if (isNaN(amount) || amount <= 0) {
        return next(new createError(400, "Payout amount must be greater than zero."));
    }

    try {
        const payout = await prisma.$transaction(async (tx) => {
            // Find or create developer's wallet inside the transaction block
            let wallet = await tx.wallet.findUnique({
                where: { userId: req.user.id }
            });

            if (!wallet) {
                wallet = await tx.wallet.create({
                    data: { userId: req.user.id }
                });
            }

            if (wallet.availableBalance < amount) {
                throw new Error("INSUFFICIENT_FUNDS");
            }

            // 1. Decrement available balance
            await tx.wallet.update({
                where: { id: wallet.id },
                data: {
                    availableBalance: { decrement: amount }
                }
            });

            // 2. Create payout record
            const newPayout = await tx.developerPayout.create({
                data: {
                    amount,
                    status: 'PENDING',
                    userId: req.user.id,
                    note,
                }
            });

            // 3. Create wallet transaction record (negative amount represents withdrawal)
            await tx.walletTransaction.create({
                data: {
                    type: 'PAYOUT',
                    amount: -amount,
                    description: `Payout Request ID: ${newPayout.id}`,
                    walletId: wallet.id,
                    payoutId: newPayout.id
                }
            });

            return newPayout;
        });

        logger.info('Developer successfully created payout request', { payoutId: payout.id, userId: req.user.id, amount });
        res.status(201).json({
            status: "success",
            message: "Payout request submitted successfully.",
            data: { payout }
        });

    } catch (err) {
        if (err.message === "INSUFFICIENT_FUNDS") {
            logger.error('Failed to request payout: Insufficient funds', { userId: req.user.id, amount });
            return next(new createError(400, "Insufficient available balance for this payout request."));
        }
        throw err;
    }
});

// Developer retrieves their own payout requests
exports.getMyPayouts = asyncErrorCatching(async (req, res, next) => {
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.payout);
    filterQuery.userId = req.user.id;
    if (filterQuery.status && typeof filterQuery.status === 'string' && filterQuery.status.includes(',')) {
        filterQuery.status = { in: filterQuery.status.split(',').map(s => s.trim()) };
    }

    const queryBuilder = new ApiFeatures(
        prisma.developerPayout,
        filterQuery,
        generatePayoutOptions()
    );

    const { data: payouts, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { payouts }
    });
});

// Admin retrieves all payout requests
exports.getAllPayouts = asyncErrorCatching(async (req, res, next) => {
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.payout);
    if (filterQuery.status && typeof filterQuery.status === 'string' && filterQuery.status.includes(',')) {
        filterQuery.status = { in: filterQuery.status.split(',').map(s => s.trim()) };
    }

    const queryBuilder = new ApiFeatures(
        prisma.developerPayout,
        filterQuery,
        generatePayoutOptions()
    );

    const { data: payouts, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { payouts }
    });
});

// Admin approves a payout request
exports.approvePayout = asyncErrorCatching(async (req, res, next) => {
    const payoutId = parseInt(req.params.id, 10);
    const { stripeTransferId } = req.body;
    const adminNote = typeof req.body.adminNote === 'string'
        ? req.body.adminNote.trim() || null
        : typeof req.body.note === 'string'
            ? req.body.note.trim() || null
            : null;

    try {
        const updatedPayout = await prisma.$transaction(async (tx) => {
            const payout = await tx.developerPayout.findUnique({
                where: { id: payoutId }
            });

            if (!payout) {
                throw new Error("PAYOUT_NOT_FOUND");
            }

            if (payout.status !== 'PENDING') {
                throw new Error("PAYOUT_NOT_PENDING");
            }

            // 1. Update status to PAID
            const p = await tx.developerPayout.update({
                where: { id: payoutId },
                data: {
                    status: 'PAID',
                    stripeTransferId: stripeTransferId || `transfer_sim_${Date.now()}`,
                    ...(adminNote ? { adminNote } : {}),
                }
            });

            // 2. Create Audit Log
            await tx.auditLog.create({
                data: {
                    actionType: 'APPROVE_PAYOUT',
                    targetId: String(payoutId),
                    reason: `Payout cleared to developer. stripeTransferId: ${stripeTransferId || 'mocked'}`,
                    adminId: req.user.id
                }
            });

            return p;
        });

        const io = req.app.get('io');
        await createAndEmitNotification({
            actionDesc: `Your payout request #${updatedPayout.id} for $${formatPayoutAmount(updatedPayout.amount)} was approved and sent.`,
            type: 'SYSTEM',
            recipientId: updatedPayout.userId,
            senderId: req.user.id,
            actionLink: walletLink(),
            unRead: true,
        }, io);

        logger.info('Payout request approved successfully by Admin', { payoutId, adminId: req.user.id });
        res.status(200).json({
            status: "success",
            message: "Payout request approved and cleared.",
            data: { payout: updatedPayout }
        });

    } catch (err) {
        if (err.message === "PAYOUT_NOT_FOUND") {
            return next(new createError(404, "Payout request not found."));
        }
        if (err.message === "PAYOUT_NOT_PENDING") {
            return next(new createError(400, "Payout request cannot be approved because it is no longer pending."));
        }
        throw err;
    }
});

// Admin rejects a payout request
exports.rejectPayout = asyncErrorCatching(async (req, res, next) => {
    const payoutId = parseInt(req.params.id, 10);
    const reason = req.body.reason || req.body.rejectReason || "Payout request rejected by administrator.";
    const adminNote = typeof reason === 'string' ? reason.trim() || null : null;

    try {
        const updatedPayout = await prisma.$transaction(async (tx) => {
            const payout = await tx.developerPayout.findUnique({
                where: { id: payoutId }
            });

            if (!payout) {
                throw new Error("PAYOUT_NOT_FOUND");
            }

            if (payout.status !== 'PENDING') {
                throw new Error("PAYOUT_NOT_PENDING");
            }

            let wallet = await tx.wallet.findUnique({
                where: { userId: payout.userId }
            });

            if (!wallet) {
                throw new Error("WALLET_NOT_FOUND");
            }

            // 1. Update status to REJECTED
            const p = await tx.developerPayout.update({
                where: { id: payoutId },
                data: {
                    status: 'REJECTED',
                    adminNote,
                }
            });

            // 2. Refund the funds back to availableBalance
            await tx.wallet.update({
                where: { id: wallet.id },
                data: {
                    availableBalance: { increment: payout.amount }
                }
            });

            // 3. Create wallet transaction record for refund/reversal
            await tx.walletTransaction.create({
                data: {
                    type: 'ADJUSTMENT',
                    amount: payout.amount,
                    description: `Refunded: Rejected Payout Request ID ${payoutId}`,
                    walletId: wallet.id,
                    payoutId: payoutId
                }
            });

            // 4. Create Audit Log
            await tx.auditLog.create({
                data: {
                    actionType: 'REJECT_PAYOUT',
                    targetId: String(payoutId),
                    reason,
                    adminId: req.user.id
                }
            });

            return p;
        });

        const io = req.app.get('io');
        const reasonNote = adminNote ? ` Reason: ${adminNote}` : '';
        await createAndEmitNotification({
            actionDesc: `Your payout request #${updatedPayout.id} for $${formatPayoutAmount(updatedPayout.amount)} was rejected.${reasonNote} Funds were returned to your available balance.`,
            type: 'SYSTEM',
            recipientId: updatedPayout.userId,
            senderId: req.user.id,
            actionLink: walletLink(),
            unRead: true,
        }, io);

        logger.info('Payout request rejected and refunded to developer available balance', { payoutId, adminId: req.user.id });
        res.status(200).json({
            status: "success",
            message: "Payout request rejected. Funds refunded back to developer available balance.",
            data: { payout: updatedPayout }
        });

    } catch (err) {
        if (err.message === "PAYOUT_NOT_FOUND") {
            return next(new createError(404, "Payout request not found."));
        }
        if (err.message === "PAYOUT_NOT_PENDING") {
            return next(new createError(400, "Payout request cannot be rejected because it is no longer pending."));
        }
        if (err.message === "WALLET_NOT_FOUND") {
            return next(new createError(404, "Developer wallet not found."));
        }
        throw err;
    }
});

// Developer cancels their own payout request
exports.cancelPayout = asyncErrorCatching(async (req, res, next) => {
    const payoutId = parseInt(req.params.id, 10);

    try {
        const updatedPayout = await prisma.$transaction(async (tx) => {
            const payout = await tx.developerPayout.findUnique({
                where: { id: payoutId }
            });

            if (!payout) {
                throw new Error("PAYOUT_NOT_FOUND");
            }

            if (req.user.role === 'DEVELOPER' && payout.userId !== req.user.id) {
                throw new Error("UNAUTHORIZED_CANCEL");
            }

            if (payout.status !== 'PENDING') {
                throw new Error("PAYOUT_NOT_PENDING");
            }

            let wallet = await tx.wallet.findUnique({
                where: { userId: payout.userId }
            });

            if (!wallet) {
                throw new Error("WALLET_NOT_FOUND");
            }

            // 1. Update status to CANCELLED
            const p = await tx.developerPayout.update({
                where: { id: payoutId },
                data: { status: 'CANCELLED' }
            });

            // 2. Refund the funds back to availableBalance
            await tx.wallet.update({
                where: { id: wallet.id },
                data: {
                    availableBalance: { increment: payout.amount }
                }
            });

            // 3. Create wallet transaction record for refund/reversal
            await tx.walletTransaction.create({
                data: {
                    type: 'ADJUSTMENT',
                    amount: payout.amount,
                    description: `Refunded: Cancelled Payout Request ID ${payoutId}`,
                    walletId: wallet.id,
                    payoutId: payoutId
                }
            });

            return p;
        });

        logger.info('Payout request cancelled by user', { payoutId, userId: req.user.id });
        res.status(200).json({
            status: "success",
            message: "Payout request cancelled successfully. Funds refunded back to your available balance.",
            data: { payout: updatedPayout }
        });

    } catch (err) {
        if (err.message === "PAYOUT_NOT_FOUND") {
            return next(new createError(404, "Payout request not found."));
        }
        if (err.message === "UNAUTHORIZED_CANCEL") {
            return next(new createError(403, "You can only cancel your own payout requests."));
        }
        if (err.message === "PAYOUT_NOT_PENDING") {
            return next(new createError(400, "Payout request cannot be cancelled because it is no longer pending."));
        }
        if (err.message === "WALLET_NOT_FOUND") {
            return next(new createError(404, "Developer wallet not found."));
        }
        throw err;
    }
});
