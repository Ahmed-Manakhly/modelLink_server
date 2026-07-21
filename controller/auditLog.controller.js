const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS, parseCommaSeparatedFilter } = require("../utils/normalizeFilterQuery");
const { generateAuditLogOptions } = require("../utils/ApiFeaturesHelpersForAuditLogs");
const { generateTransactionOptions } = require("../utils/ApiFeaturesHelpersForTransactions");
const { generateWebhookEventOptions } = require("../utils/ApiFeaturesHelpersForWebhookEvents");
const logger = require("../utils/logger");

// Admin retrieves all audit logs
exports.getAllAuditLogs = asyncErrorCatching(async (req, res, next) => {
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.auditLog);
    parseCommaSeparatedFilter(filterQuery, 'actionType');
    
    const queryBuilder = new ApiFeatures(
        prisma.auditLog,
        filterQuery,
        generateAuditLogOptions()
    );

    const { data: logs, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { logs }
    });
});

exports.getPendingCounts = asyncErrorCatching(async (req, res) => {
    const [pendingPayouts, pendingVerifications, openDisputes, failedWebhooks] = await Promise.all([
        prisma.developerPayout.count({ where: { status: 'PENDING' } }),
        prisma.developerVerification.count({ where: { status: 'PENDING' } }),
        prisma.dispute.count({
            where: { status: { in: ['OPEN', 'UNDER_REVIEW'] } },
        }),
        prisma.webhookEvent.count({ where: { status: 'FAILED' } }),
    ]);

    res.status(200).json({
        status: 'success',
        data: {
            counts: {
                payouts: pendingPayouts,
                verifications: pendingVerifications,
                disputes: openDisputes,
                webhooks: failedWebhooks,
            },
        },
    });
});

// Get platform settings
exports.getSettings = asyncErrorCatching(async (req, res, next) => {
    let settings = await prisma.systemSettings.findUnique({
        where: { id: 1 }
    });

    if (!settings) {
        settings = await prisma.systemSettings.create({
            data: { id: 1, platformFeeValue: 20 }
        });
    }

    res.status(200).json({
        status: "success",
        data: { settings }
    });
});

// Update platform settings
exports.updateSettings = asyncErrorCatching(async (req, res, next) => {
    const platformFeeValue = parseInt(req.body.platformFeeValue, 10);

    if (isNaN(platformFeeValue) || platformFeeValue < 0 || platformFeeValue > 100) {
        return next(new createError(400, "Platform fee value must be a percentage between 0 and 100."));
    }

    let settings = await prisma.systemSettings.upsert({
        where: { id: 1 },
        update: { platformFeeValue },
        create: { id: 1, platformFeeValue }
    });

    logger.info("Admin updated system settings", { platformFeeValue, adminId: req.user.id });
    res.status(200).json({
        status: "success",
        message: "System settings updated successfully.",
        data: { settings }
    });
});

// Admin retrieves all transactions
exports.getAllTransactions = asyncErrorCatching(async (req, res, next) => {
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.transaction);
    const queryBuilder = new ApiFeatures(
        prisma.transaction,
        filterQuery,
        generateTransactionOptions()
    );

    const { data: transactions, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { transactions }
    });
});

// Admin retrieves details of a single transaction
exports.getTransaction = asyncErrorCatching(async (req, res, next) => {
    const transactionId = parseInt(req.params.id, 10);

    const transaction = await prisma.transaction.findUnique({
        where: { id: transactionId },
        include: {
            order: true
        }
    });

    if (!transaction) {
        return next(new createError(404, "Transaction not found."));
    }

    res.status(200).json({
        status: "success",
        data: { transaction }
    });
});

exports.getAllWebhookEvents = asyncErrorCatching(async (req, res, next) => {
    // Map standard frontend createdAt filters to the WebhookEvent's receivedAt field
    const mappedQuery = { ...req.query };
    
    if (mappedQuery.sort) {
        mappedQuery.sort = mappedQuery.sort.replace('createdAt', 'receivedAt');
    }
    if (mappedQuery.createdAtFrom) {
        mappedQuery.receivedAtFrom = mappedQuery.createdAtFrom;
        delete mappedQuery.createdAtFrom;
    }
    if (mappedQuery.createdAtTo) {
        mappedQuery.receivedAtTo = mappedQuery.createdAtTo;
        delete mappedQuery.createdAtTo;
    }

    const filterQuery = normalizeFilterQuery(mappedQuery, FILTER_SPECS.webhookEvent);
    const queryBuilder = new ApiFeatures(
        prisma.webhookEvent,
        filterQuery,
        generateWebhookEventOptions(),
        null,
        {
            id: true,
            eventId: true,
            eventType: true,
            provider: true,
            status: true,
            failureReason: true,
            retryCount: true,
            receivedAt: true,
            processedAt: true,
        }
    );

    const { data: webhooks, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { webhooks },
    });
});
