const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const { uploadingFiles } = require('../utils/fileUploader');
const { getFiles, parseJSONField } = require('../utils/helpers');
const { generateVerificationOptions } = require('../utils/ApiFeaturesHelpersForVerifications');
const ApiFeatures = require('../utils/ApiFeatures');
const { normalizeFilterQuery, FILTER_SPECS } = require('../utils/normalizeFilterQuery');
const logger = require('../utils/logger');
const { createAndEmitNotification } = require('../utils/createAndEmitNotification');

exports.uploadVerificationDoc = uploadingFiles('verifications', [
    { name: 'document', maxCount: 1 }
]);

// Developer submits verification documents
exports.submitVerification = asyncErrorCatching(async (req, res, next) => {
    const data = parseJSONField(req.body.data) || {};
    const documentUrl = getFiles(req.files, 'document')?.[0] || null;

    if (!documentUrl && !data.documentUrl) {
        logger.error('Failed to submit verification', { error: 'Missing documentUrl', userId: req.user.id });
        return next(new createError(400, "Verification document is required."));
    }

    const finalDocUrl = documentUrl || data.documentUrl;
    const notes = data.notes || null;

    // Create or update verification request
    const verification = await prisma.developerVerification.upsert({
        where: { userId: req.user.id },
        update: {
            status: 'PENDING',
            documentUrl: finalDocUrl,
            notes,
            rejectionReason: null,
            verifiedAt: null
        },
        create: {
            userId: req.user.id,
            status: 'PENDING',
            documentUrl: finalDocUrl,
            notes
        }
    });

    logger.info('Developer submitted verification documents successfully', { verificationId: verification.id, userId: req.user.id });
    res.status(200).json({
        status: "success",
        message: "Verification request submitted. This might take a while...",
        data: { verification }
    });

    // Auto-approve is intentionally disabled.
    // Real-world flow: Admin must approve manually via Flow 02 admin step.
    // setTimeout(() => { ... }, 30000); // <-- DO NOT enable for seeding
});

// Developer gets their own verification status
exports.getVerificationMe = asyncErrorCatching(async (req, res, next) => {
    const verification = await prisma.developerVerification.findUnique({
        where: { userId: req.user.id }
    });

    res.status(200).json({
        status: "success",
        data: { verification: verification || null }
    });
});

// Admin gets all verification requests
exports.getAllVerifications = asyncErrorCatching(async (req, res, next) => {
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.verification);
    if (filterQuery.status && typeof filterQuery.status === 'string' && filterQuery.status.includes(',')) {
        filterQuery.status = { in: filterQuery.status.split(',').map(s => s.trim()) };
    }

    const queryBuilder = new ApiFeatures(
        prisma.developerVerification,
        filterQuery,
        generateVerificationOptions()
    );

    // Exclude empty-document rows — only real submissions belong in the admin queue
    queryBuilder.query.where.AND.push({ documentUrl: { not: null } });

    const { data: verifications, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get verifications', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    // notes, verifiedAt, and status are returned on each verification record (no field projection).
    res.status(200).json({
        status: "success",
        pagination,
        data: { verifications }
    });
});

// Admin gets specific verification request
exports.getVerificationById = asyncErrorCatching(async (req, res, next) => {
    const verification = await prisma.developerVerification.findUnique({
        where: { id: parseInt(req.params.id, 10) },
        include: {
            user: true
        }
    });

    if (!verification) {
        return next(new createError(404, "Verification request not found."));
    }

    res.status(200).json({
        status: "success",
        data: { verification }
    });
});

// Admin approves verification request
exports.approveVerification = asyncErrorCatching(async (req, res, next) => {
    const verificationId = parseInt(req.params.id, 10);
    const reason = req.body.reason || "Documents verified manually by admin.";

    const verification = await prisma.developerVerification.findUnique({
        where: { id: verificationId }
    });

    if (!verification) {
        return next(new createError(404, "Verification request not found."));
    }

    const result = await prisma.$transaction(async (tx) => {
        // 1. Update verification record
        const updatedVer = await tx.developerVerification.update({
            where: { id: verificationId },
            data: {
                status: 'APPROVED',
                verifiedAt: new Date(),
                rejectionReason: null
            }
        });

        // 2. Set isVerified = true on the developer's User account
        await tx.user.update({
            where: { id: verification.userId },
            data: { isVerified: true }
        });

        // 3. Create AuditLog entry
        await tx.auditLog.create({
            data: {
                actionType: 'APPROVE_DEVELOPER',
                targetId: verification.userId,
                reason,
                adminId: req.user.id
            }
        });

        return updatedVer;
    });

    const io = req.app.get('io');
    await createAndEmitNotification({
        actionDesc: 'Your developer verification has been approved. You can now publish AI models.',
        type: 'SYSTEM',
        recipientId: verification.userId,
        senderId: req.user.id,
        actionLink: '/dashboard-dev',
        unRead: true,
    }, io);

    if (io) {
        io.to(`${verification.userId}__room`).emit('user_verified', { isVerified: true });
    }

    logger.info('Developer verification request approved', { verificationId, developerId: verification.userId, adminId: req.user.id });
    res.status(200).json({
        status: "success",
        message: "Developer verification request approved successfully.",
        data: { verification: result }
    });
});

// Admin rejects verification request
exports.rejectVerification = asyncErrorCatching(async (req, res, next) => {
    const verificationId = parseInt(req.params.id, 10);
    const rejectionReason = req.body.reason || req.body.rejectionReason;

    if (!rejectionReason) {
        return next(new createError(400, "Rejection reason is required."));
    }

    const verification = await prisma.developerVerification.findUnique({
        where: { id: verificationId }
    });

    if (!verification) {
        return next(new createError(404, "Verification request not found."));
    }

    const result = await prisma.$transaction(async (tx) => {
        // 1. Update verification record
        const updatedVer = await tx.developerVerification.update({
            where: { id: verificationId },
            data: {
                status: 'REJECTED',
                rejectionReason
            }
        });

        // 2. Set isVerified = false on user
        await tx.user.update({
            where: { id: verification.userId },
            data: { isVerified: false }
        });

        // 3. Create AuditLog entry
        await tx.auditLog.create({
            data: {
                actionType: 'REJECT_DEVELOPER',
                targetId: verification.userId,
                reason: rejectionReason,
                adminId: req.user.id
            }
        });

        return updatedVer;
    });

    logger.info('Developer verification request rejected', { verificationId, developerId: verification.userId, adminId: req.user.id, rejectionReason });
    res.status(200).json({
        status: "success",
        message: "Developer verification request rejected.",
        data: { verification: result }
    });
});
