const util = require('util');
const jwt = require('jsonwebtoken');
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const { uploadingFiles } = require('../utils/fileUploader');
const { getFiles, parseJSONField } = require('../utils/helpers');
const { publicUserFields } = require('../utils/ApiFeaturesHelpersForUsers');
const { generateModelOptions } = require('../utils/ApiFeaturesHelpersForAiModels');
const ApiFeatures = require('../utils/ApiFeatures');
const logger = require('../utils/logger');
const { createAndEmitNotification } = require('../utils/createAndEmitNotification');
const { encrypt, decrypt } = require('../utils/crypto');
const { versionHasPaidOrders, getPaidOrderFlagsByVersionIds } = require('../utils/versionOrderLock');
const { isMarketplaceDemo } = require('../utils/marketplaceDemo');
const { runCategoryQuery, runModalityQuery, runBodyPartQuery } = require('../utils/taxonomyQuery');
const {
    assertSubcategoryId,
    isMedicalCategoryId,
    resolveTaxonomyId,
    normalizeModelFilterQuery,
    getChildCategoryIdsByParentSlug,
} = require('../utils/modelTaxonomy');
const { mergePresetWhere } = require('../utils/taxonomyQuery');
const taxonomyController = require('./taxonomy.controller');

/** Canonical version field is `indications`; accept legacy `useCases` on input. */
function normalizeVersionIndications(data = {}) {
    if (data.indications !== undefined && data.indications !== null && String(data.indications).trim() !== '') {
        return data.indications;
    }
    if (data.useCases !== undefined && data.useCases !== null && String(data.useCases).trim() !== '') {
        return data.useCases;
    }
    return undefined;
}

function mirrorIndicationsOnVersions(versions = []) {
    versions.forEach((v) => {
        if (v?.indications != null) {
            v.useCases = v.indications;
        }
    });
    return versions;
}

exports.uploadModelFiles = uploadingFiles('models', [
    { name: 'cover', maxCount: 1 },
    { name: 'gallery', maxCount: 20 }
]);

exports.createAiModel = asyncErrorCatching(async (req, res, next) => {
    const data = parseJSONField(req.body.data) || {};
    const cover = getFiles(req.files, 'cover')?.[0] || null;
    const galleryFiles = getFiles(req.files, 'gallery') || [];
    const imageUrl = data.imageUrl || null;

    let galleryImages = [];
    if (cover) galleryImages.push(cover);
    if (imageUrl) galleryImages.push(imageUrl);
    if (data.galleryImages && Array.isArray(data.galleryImages)) {
        galleryImages = [...galleryImages, ...data.galleryImages];
    }
    if (galleryFiles.length > 0) {
        galleryImages = [...galleryImages, ...galleryFiles];
    }
    galleryImages = [...new Set(galleryImages)];

    const {
        title, categoryId, useCases, modalityId, bodyPartId, fda, fdaUrl, endpointUrl,
        metrics, desc, price, feature, version, tags
    } = data;

    if (!title || !categoryId || !desc || price === undefined || price === null || !version) {
        logger.error('Failed to create AI Model', { error: 'Missing required data', requestId: req.id });
        return next(new createError(400, "Incomplete model registration details."));
    }

    const categoryCheck = await assertSubcategoryId(categoryId);
    if (!categoryCheck.ok) {
        return next(new createError(400, categoryCheck.message));
    }

    const resolvedCategoryId = categoryCheck.category.id;
    const categoryRecord = await prisma.category.findUnique({
        where: { id: resolvedCategoryId },
        include: { parent: true },
    });
    // Keep AiModel.category string synced from categoryRel for legacy search/display; reads prefer categoryRel.
    const categoryLabel = data.category || categoryRecord?.parent?.name || categoryRecord?.name;
    if (!categoryLabel) {
        return next(new createError(400, 'Could not resolve category label for this listing.'));
    }
    const medical = await isMedicalCategoryId(resolvedCategoryId);

    if (medical && (!modalityId || !bodyPartId)) {
        return next(new createError(400, 'Modality and body part are required for medical AI listings.'));
    }

    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        return next(new createError(400, "Version format must be Semantic Versioning (e.g., 1.0.0)."));
    }

    if (version !== '1.0.0') {
        return next(new createError(400, 'Initial version must be 1.0.0. Add higher versions from Edit after the model is saved.'));
    }

    const numericPrice = parseInt(price, 10);
    if (isNaN(numericPrice) || numericPrice < 10) {
        return next(new createError(400, "Price must be at least $10."));
    }


    // Verify Developer Profile completion (org_name and org_desc required)
    const developerUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        include: { verification: true }
    });

    if (!developerUser) {
        logger.error('Failed to create AI Model', { error: 'Developer not found', requestId: req.id });
        return next(new createError(404, "Developer account not found."));
    }

    if (!developerUser.org_name || !developerUser.org_desc) {
        logger.error('Failed to create AI Model', { error: 'Incomplete profile settings', developerId: req.user.id, requestId: req.id });
        return next(new createError(400, "Developer profile is incomplete. You must provide your Organization Name (org_name) and Organization Description (org_desc) before listing AI models."));
    }

    if (!developerUser.isVerified && developerUser.verification?.status !== 'APPROVED') {
        logger.error('Failed to create AI Model', { error: 'Developer not verified', developerId: req.user.id, requestId: req.id });
        return next(new createError(403, "You must be a verified developer to list AI models. Please complete the verification process."));
    }

    // Stripe Connected Account onboarding verification (bypass in non-production or demo portfolio):
    const isProduction = process.env.NODE_ENV === 'production' && !isMarketplaceDemo();
    if (isProduction && (!developerUser.stripeAccountId || !developerUser.stripeChargesEnabled)) {
        logger.error('Failed to create AI Model', { error: 'Stripe onboarding incomplete', developerId: req.user.id, requestId: req.id });
        return next(new createError(400, "Stripe Connected Account onboarding is incomplete. You must link your Stripe account and enable charges before you can list AI models."));
    }

    const resolvedModalityId = modalityId ? await resolveTaxonomyId('modality', modalityId) : null;
    const resolvedBodyPartId = bodyPartId ? await resolveTaxonomyId('bodyPart', bodyPartId) : null;

    if (modalityId && !resolvedModalityId) {
        return next(new createError(400, 'Selected modality does not exist.'));
    }
    if (bodyPartId && !resolvedBodyPartId) {
        return next(new createError(400, 'Selected body part does not exist.'));
    }

    // Check unique constraint for fdaUrl inside the database versions table
    if (fdaUrl) {
        const exVersion = await prisma.aiModelVersion.findFirst({
            where: { fdaUrl }
        });
        if (exVersion) {
            logger.error('Failed to create AI Model', { error: 'Duplicate fdaUrl', fdaUrl, requestId: req.id });
            return next(new createError(400, "The 'fdaUrl' field must be unique. Please try a different value!"));
        }
    }


    // Setup tags
    let modelTags = [];
    if (tags) {
        if (Array.isArray(tags)) modelTags = tags;
        else if (typeof tags === 'string') modelTags = tags.split(',').map(t => t.trim());
    }

    // Prepare version sub-features
    const versionFeatures = [];
    if (feature && typeof feature === 'string') {
        versionFeatures.push({ feature });
    }
    if (data.features && Array.isArray(data.features)) {
        data.features.forEach(f => {
            if (typeof f === 'string') versionFeatures.push({ feature: f });
            else if (f && typeof f === 'object' && f.feature) versionFeatures.push({ feature: f.feature });
        });
    }

    if (versionFeatures.length === 0) {
        return next(new createError(400, "At least one model feature is required."));
    }

    // Prepare version metrics
    const versionMetrics = [];
    if (metrics && Array.isArray(metrics)) {
        metrics.forEach(m => {
            if (m && typeof m === 'object' && m.metric) {
                versionMetrics.push({
                    metric: m.metric,
                    value: parseFloat(m.value) || 0.0,
                    metricsUrl: m.metricsUrl || null
                });
            }
        });
    }

    // Prepare version assets (encrypted storage)
    const versionAssets = [];
    if (endpointUrl) {
        versionAssets.push({
            type: 'API_ENDPOINT',
            encryptedValue: encrypt(endpointUrl)
        });
    }
    if (data.dockerImage) {
        versionAssets.push({
            type: 'DOCKER_IMAGE',
            encryptedValue: encrypt(data.dockerImage)
        });
    }
    if (data.downloadLink) {
        versionAssets.push({
            type: 'DOWNLOAD_LINK',
            encryptedValue: encrypt(data.downloadLink)
        });
    }
    if (data.licenseKey) {
        versionAssets.push({
            type: 'LICENSE_KEY',
            encryptedValue: encrypt(data.licenseKey)
        });
    }
    if (data.huggingFaceUrl) {
        versionAssets.push({
            type: 'HUGGINGFACE_URL',
            encryptedValue: encrypt(data.huggingFaceUrl)
        });
    }

    if (data.assets && Array.isArray(data.assets)) {
        data.assets.forEach(a => {
            if (a && a.type && a.value) {
                versionAssets.push({
                    type: a.type,
                    encryptedValue: encrypt(a.value)
                });
            }
        });
    }

    if (versionAssets.length === 0) {
        return next(new createError(400, 'At least one delivery asset is required (API endpoint, Docker image, download link, license key, or Hugging Face URL).'));
    }

    const versionCreate = {
        version: version || '1.0.0',
        isActive: true,
        isPrimary: true,
        price: parseInt(price, 10) || 0,
        modalityId: resolvedModalityId,
        bodyPartId: resolvedBodyPartId,
        fda: medical ? (fda === 'true' || fda === true) : false,
        fdaUrl: medical ? (fdaUrl || null) : null,
        features: { create: versionFeatures },
        metrics: { create: versionMetrics },
    };
    if (data.deliveryTime != null) {
        versionCreate.deliveryTime = parseInt(data.deliveryTime, 10);
    }
    const indications = normalizeVersionIndications(data);
    if (indications) {
        versionCreate.indications = indications;
    }
    if (versionAssets.length > 0) {
        versionCreate.assets = { create: versionAssets };
    }

    // Execute atomic creation via transaction
    const newAIModel = await prisma.$transaction(async (tx) => {
        return await tx.aiModel.create({
            data: {
                title,
                desc,
                galleryImages,
                tags: modelTags,
                developerId: req.user.id,
                status: data.status === 'DRAFT' || data.status === 'PUBLISHED' ? data.status : 'PUBLISHED',
                category: categoryLabel,
                categoryId: resolvedCategoryId,
                versions: {
                    create: [versionCreate]
                }
            },
            include: {
                versions: {
                    include: {
                        features: true,
                        metrics: true
                    }
                }
            }
        });
    });

    // Create Notification
    await createAndEmitNotification({
        actionDesc: `You have successfully created the AI model "${newAIModel.title}".`,
        type: 'MODEL',
        recipientId: req.user.id,
        senderId: req.user.id,
        actionLink: `/models/view/${newAIModel.id}`,
        unRead: true,
    }, req.app.get('io'));

    logger.info('Successfully created AI Model and its primary version', { modelId: newAIModel.id, developerId: req.user.id, requestId: req.id });
    res.status(201).json({
        status: "success",
        data: {
            newAIModel
        }
    });
});

exports.getAllAiModels = asyncErrorCatching(async (req, res, next) => {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    let isAdmin = false;
    if (token && token !== 'null' && token !== 'undefined') {
        try {
            const decoded = await util.promisify(jwt.verify)(token, process.env.ACCESS_SECRET_STR);
            if (decoded.role === 'ADMIN' || decoded.role === 'EMPLOYEE') {
                isAdmin = true;
            }
        } catch (e) {}
    }

    const filterQuery = normalizeModelFilterQuery(req.query);

    // Status enforcement: Only admins can bypass 'PUBLISHED' filter
    if (!isAdmin) {
        filterQuery.status = 'PUBLISHED';
    }

    if (filterQuery.status && typeof filterQuery.status === 'string' && filterQuery.status.includes(',')) {
        filterQuery.status = { in: filterQuery.status.split(',').map(s => s.trim()) };
    }

    let presetWhere = {};
    // Ensure public cannot see soft-deleted models
    if (!isAdmin) {
        presetWhere.deletedAt = null;
    } else if (req.query.isDeleted) {
        if (req.query.isDeleted === 'true') {
            presetWhere.deletedAt = { not: null };
        } else if (req.query.isDeleted === 'all') {
            // Do not filter by deletedAt
        } else {
            presetWhere.deletedAt = null;
        }
        delete filterQuery.isDeleted;
    } else {
        presetWhere.deletedAt = null;
    }
    if (filterQuery.categoryParentSlug) {
        const childIds = await getChildCategoryIdsByParentSlug(filterQuery.categoryParentSlug);
        delete filterQuery.categoryParentSlug;
        if (childIds.length) {
            presetWhere.categoryId = { in: childIds };
        }
    }

    const priceMin = filterQuery.priceMin;
    const priceMax = filterQuery.priceMax;
    delete filterQuery.priceMin;
    delete filterQuery.priceMax;

    // Legacy flat aliases → nested version fields
    ['price', 'priceRule', 'deliveryTime', 'deliveryTimeRule'].forEach((key) => {
        if (filterQuery[key] !== undefined) {
            filterQuery[`versions.${key}`] = filterQuery[key];
            delete filterQuery[key];
        }
    });

    const queryBuilder = new ApiFeatures(prisma.aiModel, filterQuery, generateModelOptions());
    if (Object.keys(presetWhere).length > 0) mergePresetWhere(queryBuilder.query, presetWhere);
    if (priceMin != null && priceMin !== '') {
        queryBuilder.query.where.AND.push({ versions: { some: { price: { gte: Number(priceMin) } } } });
    }
    if (priceMax != null && priceMax !== '') {
        queryBuilder.query.where.AND.push({ versions: { some: { price: { lte: Number(priceMax) } } } });
    }

    const { data: models, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get all ai models', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    logger.info('Successfully retrieved all AI Models', { count: models.length, requestId: req.id });
    res.status(200).json({
        status: "success",
        pagination,
        data: { models }
    });
});

exports.getUserAiModels = asyncErrorCatching(async (req, res, next) => {
    let token = null;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    let hasAccessToDrafts = false;
    if (token && token !== 'null' && token !== 'undefined') {
        try {
            const decoded = await util.promisify(jwt.verify)(token, process.env.ACCESS_SECRET_STR);
            if (decoded.role === 'ADMIN' || decoded.role === 'EMPLOYEE' || decoded.id === req.params.id) {
                hasAccessToDrafts = true;
            }
        } catch (e) {}
    }

    const filterQuery = normalizeModelFilterQuery(req.query);
    filterQuery.developerId = req.params.id;
    if (!hasAccessToDrafts && !req.query.status) {
        // If not authorized, force default to published
        filterQuery.status = 'PUBLISHED';
    } else if (!hasAccessToDrafts && req.query.status && req.query.status !== 'PUBLISHED') {
        // If not authorized but asked for drafts, reject or overwrite
        filterQuery.status = 'PUBLISHED';
    }

    if (filterQuery.status && typeof filterQuery.status === 'string' && filterQuery.status.includes(',')) {
        filterQuery.status = { in: filterQuery.status.split(',').map(s => s.trim()) };
    }

    const queryBuilder = new ApiFeatures(
        prisma.aiModel,
        filterQuery,
        generateModelOptions()
    );

    // Ensure deleted items are not shown by default
    mergePresetWhere(queryBuilder.query, { deletedAt: null });
    const { data: models, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get user ai models', { error, developerId: req.params.id, requestId: req.id });
        return next(new createError(400, error));
    }

    logger.info('Successfully retrieved developer AI Models', { developerId: req.params.id, count: models.length, requestId: req.id });
    res.status(200).json({
        status: "success",
        pagination,
        data: { models }
    });
});

exports.getAiModel = asyncErrorCatching(async (req, res, next) => {
    const existingAiModel = await prisma.aiModel.findUnique({
        where: { id: parseInt(req.params.id, 10) },
        include: {
            categoryRel: { select: { id: true, name: true, slug: true, parentId: true } },
            developer: { select: publicUserFields },
            versions: {
                where: { isActive: true },
                include: {
                    features: true,
                    metrics: true,
                    modalityRel: { select: { id: true, name: true, slug: true } },
                    bodyPartRel: { select: { id: true, name: true, slug: true } },
                }
            }
        }
    });

    if (!existingAiModel || existingAiModel.deletedAt) {
        logger.error('Failed to get AI Model', { error: 'Not found', modelId: req.params.id, requestId: req.id });
        return next(new createError(404, 'AI Model not found'));
    }

    let decodedUser = null;
    const authToken = (req.headers.authorization && req.headers.authorization.startsWith('Bearer'))
        ? req.headers.authorization.split(' ')[1]
        : (req.query.token || null);

    if (authToken && authToken !== 'null' && authToken !== 'undefined') {
        try {
            decodedUser = await util.promisify(jwt.verify)(authToken, process.env.ACCESS_SECRET_STR);
        } catch (e) {}
    }

    const isModelOwner = decodedUser?.id === existingAiModel.developerId;
    const isStaff = decodedUser?.role === 'ADMIN' || decodedUser?.role === 'EMPLOYEE';

    if (existingAiModel.status !== 'PUBLISHED') {
        if (!isModelOwner && !isStaff) {
            logger.warn('Unauthorized access attempt to unpublished AI Model', { modelId: existingAiModel.id, requestId: req.id });
            return next(new createError(403, 'You do not have permission to view this unpublished model.'));
        }
    }

    if ((isModelOwner || isStaff) && existingAiModel.versions?.length) {
        existingAiModel.versions = await prisma.aiModelVersion.findMany({
            where: { aiModelId: existingAiModel.id },
            include: {
                features: true,
                metrics: true,
                modalityRel: { select: { id: true, name: true, slug: true } },
                bodyPartRel: { select: { id: true, name: true, slug: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        mirrorIndicationsOnVersions(existingAiModel.versions);
        const versionIds = existingAiModel.versions.map((v) => v.id);
        const paidFlags = await getPaidOrderFlagsByVersionIds(versionIds);
        for (const version of existingAiModel.versions) {
            const assets = await prisma.modelAsset.findMany({ where: { versionId: version.id } });
            version.assets = assets.map((asset) => ({
                id: asset.id,
                type: asset.type,
                decryptedValue: decrypt(asset.encryptedValue),
            }));
            version.hasPaidOrders = paidFlags.get(version.id) === true;
        }
    } else {
        mirrorIndicationsOnVersions(existingAiModel.versions);
    }
    // Increment views only if the model is published and the viewer is not the owner
    if (existingAiModel.status === 'PUBLISHED' && !isModelOwner) {
        await prisma.aiModel.update({
            where: { id: existingAiModel.id },
            data: { views: { increment: 1 } }
        }).catch(err => logger.error('Failed to increment views', { error: err.message, modelId: existingAiModel.id }));
    }

    logger.info('Successfully retrieved AI Model details', { modelId: existingAiModel.id, requestId: req.id });
    res.status(200).json({
        status: "success",
        data: { model: existingAiModel }
    });
});

exports.deleteAiModel = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;
    const modelId = parseInt(id, 10);

    const existingModel = await prisma.aiModel.findUnique({
        where: { id: modelId },
    });

    if (!existingModel) {
        logger.error('Failed to delete AI Model', { error: 'Not found', modelId, requestId: req.id });
        return next(new createError(404, 'AI Model not found'));
    }

    if (req.user.role === 'DEVELOPER' && existingModel.developerId !== req.user.id) {
        logger.error('Unauthorized deletion attempt', { developerId: req.user.id, modelId, requestId: req.id });
        return next(new createError(403, 'You can only archive your own models'));
    }

    await prisma.aiModel.update({
        where: { id: modelId },
        data: {
            status: 'ARCHIVED',
            deletedAt: new Date()
        }
    });

    // Create Notification
    await createAndEmitNotification({
        actionDesc: `You have successfully archived the AI model "${existingModel.title}".`,
        type: 'MODEL',
        recipientId: req.user.id,
        senderId: req.user.id,
        actionLink: "/dashboard-dev",
        unRead: true,
    }, req.app.get('io'));

    logger.info('Successfully archived/soft-deleted AI Model', { modelId, requestId: req.id });
    res.status(204).json({
        status: "success",
        data: null
    });
});

exports.updateAiModel = asyncErrorCatching(async (req, res, next) => {
    const modelId = parseInt(req.params.id, 10);

    const existingModel = await prisma.aiModel.findUnique({
        where: { id: modelId },
    });

    if (!existingModel) {
        logger.error('Failed to update AI Model', { error: 'Not found', modelId, requestId: req.id });
        return next(new createError(404, 'Model not found!'));
    }

    if (req.user.role === 'DEVELOPER' && existingModel.developerId !== req.user.id) {
        logger.error('Unauthorized update attempt', { developerId: req.user.id, modelId, requestId: req.id });
        return next(new createError(403, 'You can only update your own models'));
    }

    const data = req.body.data ? (parseJSONField(req.body.data) || {}) : req.body;
    let cover = getFiles(req.files, 'cover')?.[0] || null;
    const galleryFiles = getFiles(req.files, 'gallery') || [];

    // Top-level Model fields
    const topLevelFields = ['title', 'desc', 'status', 'tags'];
    const modelData = { updatedAt: new Date() };

    topLevelFields.forEach(field => {
        if (data[field] !== undefined) {
            modelData[field] = data[field];
        }
    });

    if ((req.user.role === 'ADMIN' || req.user.role === 'EMPLOYEE') && data.featured !== undefined) {
        modelData.featured = Boolean(data.featured);
    }

    if (data.restore === true && (req.user.role === 'ADMIN' || req.user.role === 'EMPLOYEE')) {
        modelData.deletedAt = null;
        modelData.status = 'PUBLISHED';
    }

    let galleryImages = [];
    if (cover) galleryImages.push(cover);
    if (data.galleryImages && Array.isArray(data.galleryImages)) {
        galleryImages = [...galleryImages, ...data.galleryImages];
    }
    if (galleryFiles.length > 0) {
        galleryImages = [...galleryImages, ...galleryFiles];
    }
    if (galleryImages.length > 0) {
        modelData.galleryImages = [...new Set(galleryImages)];
    } else if (cover) {
        modelData.galleryImages = [cover];
    } else if (data.galleryImages && Array.isArray(data.galleryImages) && data.galleryImages.length === 0) {
        modelData.galleryImages = [];
    }

    if (data.categoryId !== undefined) {
        const categoryCheck = await assertSubcategoryId(data.categoryId);
        if (!categoryCheck.ok) throw new createError(400, categoryCheck.message);
        modelData.categoryId = categoryCheck.category.id;
    }

    let resolvedModalityId;
    if (data.modalityId !== undefined) {
        resolvedModalityId = data.modalityId ? await resolveTaxonomyId('modality', data.modalityId) : null;
        if (data.modalityId && !resolvedModalityId) {
            throw new createError(400, 'Selected modality does not exist.');
        }
    }

    let resolvedBodyPartId;
    if (data.bodyPartId !== undefined) {
        resolvedBodyPartId = data.bodyPartId ? await resolveTaxonomyId('bodyPart', data.bodyPartId) : null;
        if (data.bodyPartId && !resolvedBodyPartId) {
            throw new createError(400, 'Selected body part does not exist.');
        }
    }

    const updatedModel = await prisma.$transaction(async (tx) => {
        // Uniqueness validation on fdaUrl if it is being updated
        if (data.fdaUrl) {
            const exVersion = await tx.aiModelVersion.findFirst({
                where: {
                    fdaUrl: data.fdaUrl,
                    NOT: { aiModelId: modelId }
                },
            });
            if (exVersion) {
                logger.error('Failed to update AI Model', { error: 'Duplicate fdaUrl', fdaUrl: data.fdaUrl, requestId: req.id });
                throw new createError(400, "The 'fdaUrl' field must be unique. Please try a different value!");
            }
        }

        // 1. Update the top level model
        const m = await tx.aiModel.update({
            where: { id: modelId },
            data: modelData,
        });

        // 2. Find target version (explicit versionId or primary fallback)
        let targetVersion = null;
        if (data.versionId !== undefined && data.versionId !== null) {
            targetVersion = await tx.aiModelVersion.findFirst({
                where: { id: parseInt(data.versionId, 10), aiModelId: modelId },
            });
            if (!targetVersion) {
                throw new createError(400, 'Version not found for this model.');
            }
        } else {
            targetVersion = await tx.aiModelVersion.findFirst({
                where: { aiModelId: modelId, isPrimary: true },
            });
        }

        if (targetVersion) {
            const versionData = {};
            const versionFields = ['price', 'fda', 'fdaUrl', 'isActive', 'isPrimary', 'version', 'deliveryTime'];

            versionFields.forEach(field => {
                if (data[field] !== undefined) {
                    if (field === 'price' || field === 'deliveryTime') {
                        versionData[field] = parseInt(data[field], 10);
                    } else if (field === 'fda' || field === 'isActive' || field === 'isPrimary') {
                        versionData[field] = data[field] === 'true' || data[field] === true;
                    } else {
                        versionData[field] = data[field];
                    }
                }
            });

            const indications = normalizeVersionIndications(data);
            if (indications !== undefined) {
                versionData.indications = indications;
            }

            if (resolvedModalityId !== undefined) {
                versionData.modalityId = resolvedModalityId;
            }
            if (resolvedBodyPartId !== undefined) {
                versionData.bodyPartId = resolvedBodyPartId;
            }

            if (versionData.isPrimary === true) {
                await tx.aiModelVersion.updateMany({
                    where: { aiModelId: modelId, NOT: { id: targetVersion.id } },
                    data: { isPrimary: false },
                });
            }

            // Update target version fields
            if (Object.keys(versionData).length > 0) {
                await tx.aiModelVersion.update({
                    where: { id: targetVersion.id },
                    data: versionData,
                });
            }

            // Update features
            if (data.features && Array.isArray(data.features)) {
                await tx.aiModelFeature.deleteMany({ where: { versionId: targetVersion.id } });
                await tx.aiModelFeature.createMany({
                    data: data.features.map(f => ({
                        feature: typeof f === 'string' ? f : f.feature,
                        versionId: targetVersion.id,
                    })),
                });
            } else if (data.feature && typeof data.feature === 'string') {
                await tx.aiModelFeature.deleteMany({ where: { versionId: targetVersion.id } });
                await tx.aiModelFeature.create({
                    data: {
                        feature: data.feature,
                        versionId: targetVersion.id,
                    },
                });
            }

            // Update metrics
            if (data.metrics && Array.isArray(data.metrics)) {
                await tx.aiModelMetric.deleteMany({ where: { versionId: targetVersion.id } });
                await tx.aiModelMetric.createMany({
                    data: data.metrics.map(m => ({
                        metric: m.metric,
                        value: parseFloat(m.value) || 0.0,
                        metricsUrl: m.metricsUrl || null,
                        versionId: targetVersion.id,
                    })),
                });
            }

            // Update sensitive assets if provided (blocked when version has paid orders)
            const assetMappings = {
                endpointUrl: 'API_ENDPOINT',
                dockerImage: 'DOCKER_IMAGE',
                downloadLink: 'DOWNLOAD_LINK',
                licenseKey: 'LICENSE_KEY',
                huggingFaceUrl: 'HUGGINGFACE_URL',
            };

            const hasAssetPayload = Object.keys(assetMappings).some((key) => data[key]);
            if (hasAssetPayload && req.user.role !== 'ADMIN' && req.user.role !== 'EMPLOYEE') {
                const locked = await versionHasPaidOrders(targetVersion.id, tx);
                if (locked) {
                    throw new createError(403, 'Delivery assets cannot be changed for a version with paid or delivered orders.');
                }
            }

            for (const [key, type] of Object.entries(assetMappings)) {
                if (data[key]) {
                    await tx.modelAsset.deleteMany({ where: { versionId: targetVersion.id, type } });
                    await tx.modelAsset.create({
                        data: {
                            type,
                            encryptedValue: encrypt(data[key]),
                            versionId: targetVersion.id,
                        },
                    });
                }
            }
        }

        return m;
    });

    // Create Notification
    await createAndEmitNotification({
        actionDesc: `You have successfully updated the AI model "${updatedModel.title}".`,
        type: 'MODEL',
        recipientId: req.user.id,
        senderId: req.user.id,
        actionLink: `/models/view/${updatedModel.id}`,
        unRead: true,
    }, req.app.get('io'));

    logger.info('Successfully updated AI Model and its primary version details', { modelId, requestId: req.id });
    res.status(200).json({
        status: 'success',
        message: 'AI Model updated successfully!',
        data: updatedModel,
    });
});

exports.getCategories = asyncErrorCatching(async (req, res, next) => {
    const { data: categories, pagination } = await runCategoryQuery(req.query);
    res.status(200).json({ status: 'success', pagination, data: { categories } });
});

exports.getModalities = asyncErrorCatching(async (req, res, next) => {
    const { data: modalities, pagination } = await runModalityQuery(req.query);
    res.status(200).json({ status: 'success', pagination, data: { modalities } });
});

exports.getBodyParts = asyncErrorCatching(async (req, res, next) => {
    const { data: bodyParts, pagination } = await runBodyPartQuery(req.query);
    res.status(200).json({ status: 'success', pagination, data: { bodyParts } });
});

exports.getTags = asyncErrorCatching(async (req, res, next) => {
    return taxonomyController.searchTags(req, res, next);
});

exports.getFilters = asyncErrorCatching(async (req, res, next) => {
    const { data: categories } = await runCategoryQuery({ subcategoriesOnly: 'true', limit: 500 });
    const { data: modalities } = await runModalityQuery({ limit: 500 });
    const { data: bodyParts } = await runBodyPartQuery({ limit: 500 });

    // Aggregate unique tags
    const models = await prisma.aiModel.findMany({ select: { tags: true } });
    const tags = Array.from(new Set(models.flatMap(m => m.tags || [])));

    // Aggregate unique features (latest 50)
    const featuresRec = await prisma.aiModelFeature.findMany({
        orderBy: { id: 'desc' },
        take: 500,
        select: { feature: true }
    });
    const features = Array.from(new Set(featuresRec.map(f => f.feature))).filter(Boolean).slice(0, 50);

    // Aggregate unique metrics (latest 50)
    const metricsRec = await prisma.aiModelMetric.findMany({
        orderBy: { id: 'desc' },
        take: 500,
        select: { metric: true }
    });
    const metrics = Array.from(new Set(metricsRec.map(m => m.metric))).filter(Boolean).slice(0, 50);

    res.status(200).json({
        status: 'success',
        data: {
            categories,
            modalities,
            bodyParts,
            tags,
            features,
            metrics
        }
    });
});

exports.bulkUpdateAiModels = asyncErrorCatching(async (req, res, next) => {
    if (req.user.role !== 'ADMIN' && req.user.role !== 'EMPLOYEE') {
        return next(new createError(403, 'Only administrators can perform bulk model updates.'));
    }

    const { ids, status, featured } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
        return next(new createError(400, 'ids array is required.'));
    }

    const parsedIds = ids.map((id) => parseInt(id, 10)).filter((id) => !Number.isNaN(id));
    if (parsedIds.length === 0) {
        return next(new createError(400, 'No valid model ids provided.'));
    }

    const data = {};
    const allowedStatuses = ['DRAFT', 'PUBLISHED', 'SUSPENDED', 'ARCHIVED'];
    if (status !== undefined) {
        if (!allowedStatuses.includes(status)) {
            return next(new createError(400, 'Invalid status value.'));
        }
        data.status = status;
        data.deletedAt = status === 'ARCHIVED' ? new Date() : null;
    }
    if (featured !== undefined) {
        data.featured = Boolean(featured);
    }

    if (Object.keys(data).length === 0) {
        return next(new createError(400, 'Provide status and/or featured to update.'));
    }

    const result = await prisma.aiModel.updateMany({
        where: { id: { in: parsedIds } },
        data,
    });

    logger.info({
        event: 'bulkUpdateAiModels',
        outcome: 'Success',
        count: result.count,
        requestId: req.id,
    }, 'Bulk model update completed');

    res.status(200).json({
        status: 'success',
        message: `${result.count} model(s) updated.`,
        data: { count: result.count },
    });
});
