const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const errorMessages = require("../utils/errorMessages");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const logger = require("../utils/logger");
const { encrypt, decrypt } = require("../utils/crypto");
const { versionHasPaidOrders } = require("../utils/versionOrderLock");
const { createAndEmitNotification } = require("../utils/createAndEmitNotification");

const ASSETS_LOCKED_MESSAGE = "Delivery assets cannot be changed for a version with paid or delivered orders.";

// Helper to check ownership of AI Model
const checkModelOwnership = async (aiModelId, userId) => {
    const model = await prisma.aiModel.findUnique({
        where: { id: aiModelId }
    });
    return model && model.developerId === userId;
};

// Helper to check ownership of AI Model Version
const checkVersionOwnership = async (versionId, userId) => {
    const version = await prisma.aiModelVersion.findUnique({
        where: { id: versionId },
        include: { aiModel: true }
    });
    return version && version.aiModel.developerId === userId;
};

// -------------------------------------------------------------
// 1. Version Operations
// -------------------------------------------------------------

exports.createVersion = asyncErrorCatching(async (req, res, next) => {
    const aiModelId = parseInt(req.params.id, 10);
    const { version, changelog, isPrimary, isActive, price } = req.body;

    if (!version) {
        return next(new createError(400, "Version code/name is required."));
    }
    if (price === undefined) {
        return next(new createError(400, "Price is required."));
    }

    const model = await prisma.aiModel.findUnique({ where: { id: aiModelId } });
    if (!model) {
        return next(new createError(404, "AI Model not found."));
    }

    if (req.user.role !== "ADMIN" && model.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    // Check if version code already exists for this model
    const existing = await prisma.aiModelVersion.findFirst({
        where: { aiModelId, version }
    });
    if (existing) {
        return next(new createError(400, "This version code already exists for this model."));
    }

    const newVersion = await prisma.$transaction(async (tx) => {
        if (isPrimary) {
            // Set all other versions to non-primary
            await tx.aiModelVersion.updateMany({
                where: { aiModelId },
                data: { isPrimary: false }
            });
        }

        return await tx.aiModelVersion.create({
            data: {
                version,
                price: parseInt(price, 10),
                isPrimary: isPrimary !== undefined ? (isPrimary === 'true' || isPrimary === true) : false,
                isActive: isActive !== undefined ? (isActive === 'true' || isActive === true) : true,
                aiModelId
            }
        });
    });

    logger.info("Created new AI Model version", { aiModelId, versionId: newVersion.id });

    if (newVersion.isActive) {
        const pastBuyers = await prisma.order.findMany({
            where: {
                aiModelId,
                status: { in: ['PAID', 'DELIVERED'] },
                NOT: { versionId: newVersion.id },
            },
            select: { clientId: true },
            distinct: ['clientId'],
        });

        const io = req.app.get('io');
        for (const row of pastBuyers) {
            await createAndEmitNotification({
                actionDesc: `New version ${newVersion.version} is available for "${model.title}".`,
                type: 'MODEL',
                recipientId: row.clientId,
                senderId: model.developerId,
                actionLink: `/models/view/${aiModelId}`,
                unRead: true,
            }, io);
        }
    }

    res.status(201).json({ status: "success", data: { version: newVersion } });
});

exports.getAiModelVersions = asyncErrorCatching(async (req, res, next) => {
    const aiModelId = parseInt(req.params.id, 10);

    const model = await prisma.aiModel.findUnique({ where: { id: aiModelId } });
    if (!model) {
        return next(new createError(404, "AI Model not found."));
    }

    const versions = await prisma.aiModelVersion.findMany({
        where: { aiModelId },
        orderBy: { createdAt: "desc" }
    });

    res.status(200).json({ status: "success", data: { versions } });
});

exports.getVersionDetails = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);

    const version = await prisma.aiModelVersion.findUnique({
        where: { id: versionId },
        include: {
            features: true,
            metrics: true,
            assets: true,
            aiModel: true
        }
    });

    if (!version) {
        return next(new createError(404, "Version not found."));
    }

    res.status(200).json({ status: "success", data: { version } });
});

exports.updateVersion = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);
    const { version, isPrimary, isActive, price } = req.body;

    const existingVersion = await prisma.aiModelVersion.findUnique({
        where: { id: versionId },
        include: { aiModel: true }
    });
    if (!existingVersion) {
        return next(new createError(404, "Version not found."));
    }

    if (req.user.role !== "ADMIN" && existingVersion.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const updated = await prisma.$transaction(async (tx) => {
        if (isPrimary) {
            await tx.aiModelVersion.updateMany({
                where: { aiModelId: existingVersion.aiModelId },
                data: { isPrimary: false }
            });
        }

        return await tx.aiModelVersion.update({
            where: { id: versionId },
            data: {
                version: version !== undefined ? version : undefined,
                price: price !== undefined ? parseInt(price, 10) : undefined,
                isPrimary: isPrimary !== undefined ? isPrimary : undefined,
                isActive: isActive !== undefined ? isActive : undefined
            }
        });
    });

    logger.info("Updated AI Model version", { versionId });
    res.status(200).json({ status: "success", data: { version: updated } });
});

exports.deleteVersion = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);

    const existingVersion = await prisma.aiModelVersion.findUnique({
        where: { id: versionId },
        include: { aiModel: true }
    });
    if (!existingVersion) {
        return next(new createError(404, "Version not found."));
    }

    if (req.user.role !== "ADMIN" && existingVersion.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    await prisma.aiModelVersion.delete({ where: { id: versionId } });

    logger.info("Deleted AI Model version", { versionId });
    res.status(204).json({ status: "success", data: null });
});

exports.activateVersion = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);
    const { isActive } = req.body;

    if (isActive === undefined) {
        return next(new createError(400, "isActive parameter is required."));
    }

    const existingVersion = await prisma.aiModelVersion.findUnique({
        where: { id: versionId },
        include: { aiModel: true }
    });
    if (!existingVersion) {
        return next(new createError(404, "Version not found."));
    }

    if (req.user.role !== "ADMIN" && existingVersion.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const updated = await prisma.aiModelVersion.update({
        where: { id: versionId },
        data: { isActive }
    });

    res.status(200).json({ status: "success", data: { version: updated } });
});

exports.setPrimaryVersion = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);

    const existingVersion = await prisma.aiModelVersion.findUnique({
        where: { id: versionId },
        include: { aiModel: true }
    });
    if (!existingVersion) {
        return next(new createError(404, "Version not found."));
    }

    if (req.user.role !== "ADMIN" && existingVersion.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const updated = await prisma.$transaction(async (tx) => {
        await tx.aiModelVersion.updateMany({
            where: { aiModelId: existingVersion.aiModelId },
            data: { isPrimary: false }
        });

        return await tx.aiModelVersion.update({
            where: { id: versionId },
            data: { isPrimary: true }
        });
    });

    res.status(200).json({ status: "success", data: { version: updated } });
});

// -------------------------------------------------------------
// 2. Feature Operations
// -------------------------------------------------------------

exports.createFeature = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);
    const { feature } = req.body;

    if (!feature) {
        return next(new createError(400, "Feature text is required."));
    }

    const hasAccess = await checkVersionOwnership(versionId, req.user.id);
    if (req.user.role !== "ADMIN" && !hasAccess) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const newFeature = await prisma.aiModelFeature.create({
        data: { feature, versionId }
    });

    res.status(201).json({ status: "success", data: { feature: newFeature } });
});

exports.getFeatures = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);

    const features = await prisma.aiModelFeature.findMany({
        where: { versionId }
    });

    res.status(200).json({ status: "success", data: { features } });
});

exports.updateFeature = asyncErrorCatching(async (req, res, next) => {
    const featureId = parseInt(req.params.id, 10);
    const { feature } = req.body;

    const existingFeature = await prisma.aiModelFeature.findUnique({
        where: { id: featureId },
        include: { version: { include: { aiModel: true } } }
    });
    if (!existingFeature) {
        return next(new createError(404, "Feature not found."));
    }

    if (req.user.role !== "ADMIN" && existingFeature.version.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const updated = await prisma.aiModelFeature.update({
        where: { id: featureId },
        data: {
            feature: feature !== undefined ? feature : undefined
        }
    });

    res.status(200).json({ status: "success", data: { feature: updated } });
});

exports.deleteFeature = asyncErrorCatching(async (req, res, next) => {
    const featureId = parseInt(req.params.id, 10);

    const existingFeature = await prisma.aiModelFeature.findUnique({
        where: { id: featureId },
        include: { version: { include: { aiModel: true } } }
    });
    if (!existingFeature) {
        return next(new createError(404, "Feature not found."));
    }

    if (req.user.role !== "ADMIN" && existingFeature.version.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    await prisma.aiModelFeature.delete({ where: { id: featureId } });

    res.status(204).json({ status: "success", data: null });
});

// -------------------------------------------------------------
// 3. Metric Operations
// -------------------------------------------------------------

exports.createMetric = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);
    const { metric, value, metricsUrl } = req.body;

    if (!metric || value === undefined) {
        return next(new createError(400, "Metric name and value are required."));
    }

    const hasAccess = await checkVersionOwnership(versionId, req.user.id);
    if (req.user.role !== "ADMIN" && !hasAccess) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const newMetric = await prisma.aiModelMetric.create({
        data: {
            metric,
            value: parseFloat(value),
            metricsUrl: metricsUrl || null,
            versionId
        }
    });

    res.status(201).json({ status: "success", data: { metric: newMetric } });
});

exports.getMetrics = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);

    const metrics = await prisma.aiModelMetric.findMany({
        where: { versionId }
    });

    res.status(200).json({ status: "success", data: { metrics } });
});

exports.updateMetric = asyncErrorCatching(async (req, res, next) => {
    const metricId = parseInt(req.params.id, 10);
    const { metric, value, metricsUrl } = req.body;

    const existingMetric = await prisma.aiModelMetric.findUnique({
        where: { id: metricId },
        include: { version: { include: { aiModel: true } } }
    });
    if (!existingMetric) {
        return next(new createError(404, "Metric not found."));
    }

    if (req.user.role !== "ADMIN" && existingMetric.version.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const updated = await prisma.aiModelMetric.update({
        where: { id: metricId },
        data: {
            metric: metric !== undefined ? metric : undefined,
            value: value !== undefined ? parseFloat(value) : undefined,
            metricsUrl: metricsUrl !== undefined ? metricsUrl : undefined
        }
    });

    res.status(200).json({ status: "success", data: { metric: updated } });
});

exports.deleteMetric = asyncErrorCatching(async (req, res, next) => {
    const metricId = parseInt(req.params.id, 10);

    const existingMetric = await prisma.aiModelMetric.findUnique({
        where: { id: metricId },
        include: { version: { include: { aiModel: true } } }
    });
    if (!existingMetric) {
        return next(new createError(404, "Metric not found."));
    }

    if (req.user.role !== "ADMIN" && existingMetric.version.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    await prisma.aiModelMetric.delete({ where: { id: metricId } });

    res.status(204).json({ status: "success", data: null });
});

// -------------------------------------------------------------
// 4. Asset Operations & Download Validation
// -------------------------------------------------------------

exports.createAsset = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);
    const { type, value } = req.body; // type: "DOWNLOAD_LINK", "API_ENDPOINT", etc.

    if (!type || !value) {
        return next(new createError(400, "Asset type and value are required."));
    }

    const hasAccess = await checkVersionOwnership(versionId, req.user.id);
    if (req.user.role !== "ADMIN" && !hasAccess) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        const locked = await versionHasPaidOrders(versionId);
        if (locked) {
            return next(new createError(403, ASSETS_LOCKED_MESSAGE));
        }
    }

    const encryptedValue = encrypt(value);
    if (!encryptedValue) {
        return next(new createError(500, "Encryption failed."));
    }

    const asset = await prisma.modelAsset.create({
        data: { type, encryptedValue, versionId }
    });

    res.status(201).json({ status: "success", data: { asset } });
});

exports.getAssets = asyncErrorCatching(async (req, res, next) => {
    const versionId = parseInt(req.params.id, 10);

    const version = await prisma.aiModelVersion.findUnique({
        where: { id: versionId },
        include: { aiModel: true }
    });

    if (!version) {
        return next(new createError(404, "Version not found."));
    }

    // Restricted to model developer owner or admin
    if (req.user.role !== "ADMIN" && version.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const assets = await prisma.modelAsset.findMany({
        where: { versionId }
    });

    res.status(200).json({ status: "success", data: { assets } });
});

exports.updateAsset = asyncErrorCatching(async (req, res, next) => {
    const assetId = parseInt(req.params.id, 10);
    const { type, value } = req.body;

    const asset = await prisma.modelAsset.findUnique({
        where: { id: assetId },
        include: { version: { include: { aiModel: true } } }
    });
    if (!asset) {
        return next(new createError(404, "Asset not found."));
    }

    if (req.user.role !== "ADMIN" && asset.version.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        const locked = await versionHasPaidOrders(asset.versionId);
        if (locked) {
            return next(new createError(403, ASSETS_LOCKED_MESSAGE));
        }
    }

    const dataToUpdate = {};
    if (type !== undefined) dataToUpdate.type = type;
    if (value !== undefined) {
        const encrypted = encrypt(value);
        if (!encrypted) {
            return next(new createError(500, "Encryption failed."));
        }
        dataToUpdate.encryptedValue = encrypted;
    }

    const updated = await prisma.modelAsset.update({
        where: { id: assetId },
        data: dataToUpdate
    });

    res.status(200).json({ status: "success", data: { asset: updated } });
});

exports.deleteAsset = asyncErrorCatching(async (req, res, next) => {
    const assetId = parseInt(req.params.id, 10);

    const asset = await prisma.modelAsset.findUnique({
        where: { id: assetId },
        include: { version: { include: { aiModel: true } } }
    });
    if (!asset) {
        return next(new createError(404, "Asset not found."));
    }

    if (req.user.role !== "ADMIN" && asset.version.aiModel.developerId !== req.user.id) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    if (req.user.role !== "ADMIN" && req.user.role !== "EMPLOYEE") {
        const locked = await versionHasPaidOrders(asset.versionId);
        if (locked) {
            return next(new createError(403, ASSETS_LOCKED_MESSAGE));
        }
    }

    await prisma.modelAsset.delete({ where: { id: assetId } });

    res.status(204).json({ status: "success", data: null });
});

exports.downloadAsset = asyncErrorCatching(async (req, res, next) => {
    const assetId = parseInt(req.params.id, 10);

    const asset = await prisma.modelAsset.findUnique({
        where: { id: assetId },
        include: { version: { include: { aiModel: true } } }
    });

    if (!asset) {
        return next(new createError(404, "Asset not found."));
    }

    const developerId = asset.version.aiModel.developerId;
    const aiModelId = asset.version.aiModelId;

    // Authorization validation:
    // 1. Is user an ADMIN or EMPLOYEE?
    // 2. Is user the developer owner of this model?
    // 3. Has the client user bought the model (status: DELIVERED or PAID order)?
    let hasAccess = false;

    if (req.user.role === "ADMIN" || req.user.role === "EMPLOYEE") {
        hasAccess = true;
    } else if (req.user.id === developerId) {
        hasAccess = true;
    } else {
        // Check order history
        const order = await prisma.order.findFirst({
            where: {
                clientId: req.user.id,
                aiModelId,
                status: { in: ["PAID", "DELIVERED"] }
            }
        });
        if (order) {
            hasAccess = true;
        }
    }

    if (!hasAccess) {
        return next(new createError(403, "You do not have access to download this asset. An active purchase is required."));
    }

    const decryptedValue = decrypt(asset.encryptedValue);
    if (!decryptedValue) {
        return next(new createError(500, "Failed to decrypt the asset value."));
    }

    logger.info("Asset secure download request succeeded", { userId: req.user.id, assetId });

    // If external URL, redirect. Else return JSON value.
    if (asset.type === 'DOWNLOAD_LINK' || asset.type === 'API_ENDPOINT') {
        const path = require('path');
        const fs = require('fs');
        const publicDir = process.env.PUBLIC_DIR;

        if (publicDir) {
            const localFilePath = path.join(publicDir, decryptedValue);
            if (fs.existsSync(localFilePath) && fs.lstatSync(localFilePath).isFile()) {
                return res.download(localFilePath);
            }
        }
        return res.redirect(decryptedValue);
    }

    res.status(200).json({
        status: "success",
        type: asset.type,
        value: decryptedValue
    });
});
