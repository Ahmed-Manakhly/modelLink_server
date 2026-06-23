const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const prisma = require("../prisma/prisma");
const logger = require("../utils/logger");
const { uploadingFiles } = require("../utils/fileUploader");
const { getFile, parseJSONField } = require("../utils/helpers");
const { runTaxonomyQuery } = require("../utils/taxonomyQuery");
const {
    assertValidParentCategoryId,
    getCategoryImpact,
    safeDeleteCategory,
    getModalityImpact,
    safeDeleteModality,
    getBodyPartImpact,
    safeDeleteBodyPart,
} = require("../utils/taxonomySafety");
const { generateCategoryOptions } = require("../utils/ApiFeaturesHelpersForCategories");
const { generateModalityOptions } = require("../utils/ApiFeaturesHelpersForModalities");
const { generateBodyPartOptions } = require("../utils/ApiFeaturesHelpersForBodyParts");

exports.uploadCategoryIcon = uploadingFiles("assets", [{ name: "icon", maxCount: 1 }]);

exports.getAllCategories = asyncErrorCatching(async (req, res, next) => {
    const { data: categories, pagination } = await runTaxonomyQuery(
        prisma.category,
        req.query,
        ({ includeChildren }) => generateCategoryOptions({ includeChildren })
    );
    res.status(200).json({ status: "success", pagination, data: { categories } });
});

exports.getCategoriesManage = asyncErrorCatching(async (req, res) => {
    const parents = await prisma.category.findMany({
        where: { parentId: null },
        orderBy: { name: 'asc' },
        include: {
            children: {
                orderBy: { name: 'asc' },
                include: { _count: { select: { models: true } } },
            },
            _count: { select: { models: true, children: true } },
        },
    });

    res.status(200).json({
        status: 'success',
        data: { categories: parents },
    });
});

exports.getCategoryImpact = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    const impact = await getCategoryImpact(id);
    const subcategories = await prisma.category.findMany({
        where: { parentId: { not: null } },
        select: { id: true, name: true, slug: true, parentId: true },
        orderBy: { name: 'asc' },
    });
    const parentGroups = await prisma.category.findMany({
        where: { parentId: null },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
    });

    res.status(200).json({
        status: 'success',
        data: {
            ...impact,
            reassignOptions: {
                subcategories: subcategories.filter((c) => c.id !== id),
                parentGroups: parentGroups.filter((c) => c.id !== id),
            },
        },
    });
});

exports.createCategory = asyncErrorCatching(async (req, res, next) => {
    const body = parseJSONField(req.body.data) || req.body;
    const { name, slug, parentId } = body;
    const icon = getFile(req.files, "icon");
    if (!name || !slug) {
        return next(new createError(400, "Category name and slug are required"));
    }
    const existingCategory = await prisma.category.findFirst({ where: { name } });
    if (existingCategory) {
        return next(new createError(400, "Category name already exists"));
    }
    const existingCategorySlug = await prisma.category.findFirst({ where: { slug } });
    if (existingCategorySlug) {
        return next(new createError(400, "Category slug already exists"));
    }

    const data = { name, slug };
    if (icon) data.svg = icon;
    if (parentId !== undefined && parentId !== null && parentId !== "") {
        data.parentId = await assertValidParentCategoryId(parentId);
    }

    const category = await prisma.category.create({ data });
    logger.info("Category created", { categoryId: category.id, name, slug, parentId: data.parentId ?? null });
    res.status(201).json({ status: "success", data: { category } });
});

exports.updateCategory = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    const body = parseJSONField(req.body.data) || req.body;
    const { name, slug, parentId } = body;
    const icon = getFile(req.files, "icon");

    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
        return next(new createError(404, 'Category not found.'));
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (slug !== undefined) data.slug = slug;
    if (icon) data.svg = icon;
    if (parentId !== undefined) {
        if (parentId === null || parentId === '') {
            data.parentId = null;
        } else {
            const parsedParentId = await assertValidParentCategoryId(parentId);
            if (parsedParentId === id) {
                return next(new createError(400, 'A category cannot be its own parent.'));
            }
            data.parentId = parsedParentId;
        }
    }

    const childCount = await prisma.category.count({ where: { parentId: id } });
    if (childCount > 0 && data.parentId !== undefined && data.parentId !== null) {
        return next(new createError(400, 'Parent groups with subcategories cannot be moved under another parent.'));
    }

    const category = await prisma.category.update({ where: { id }, data });
    logger.info("Category updated", { categoryId: id });
    res.status(200).json({ status: "success", data: { category } });
});

exports.deleteCategory = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    await safeDeleteCategory(id, {
        reassignModelsTo: body.reassignModelsTo,
        reassignChildrenTo: body.reassignChildrenTo,
    });
    logger.info("Category deleted", { categoryId: id });
    res.status(204).json({ status: "success", data: null });
});

exports.getAllModalities = asyncErrorCatching(async (req, res, next) => {
    const { data: modalities, pagination } = await runTaxonomyQuery(
        prisma.modality,
        req.query,
        generateModalityOptions
    );
    res.status(200).json({ status: "success", pagination, data: { modalities } });
});

exports.getModalitiesManage = asyncErrorCatching(async (req, res) => {
    const modalities = await prisma.modality.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { versions: true } } },
    });
    res.status(200).json({ status: 'success', data: { modalities } });
});

exports.getModalityImpact = asyncErrorCatching(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const impact = await getModalityImpact(id);
    const modalities = await prisma.modality.findMany({
        where: { NOT: { id } },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
    });
    res.status(200).json({
        status: 'success',
        data: { ...impact, reassignOptions: { modalities } },
    });
});

exports.createModality = asyncErrorCatching(async (req, res, next) => {
    const body = parseJSONField(req.body.data) || req.body;
    const { name, slug } = body;
    if (!name || !slug) {
        return next(new createError(400, "Modality name and slug are required"));
    }
    const modality = await prisma.modality.create({ data: { name, slug } });
    logger.info("Modality created", { modalityId: modality.id, name, slug });
    res.status(201).json({ status: "success", data: { modality } });
});

exports.updateModality = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    const body = parseJSONField(req.body.data) || req.body;
    const { name, slug } = body;
    const modality = await prisma.modality.update({ where: { id }, data: { name, slug } });
    logger.info("Modality updated", { modalityId: id });
    res.status(200).json({ status: "success", data: { modality } });
});

exports.deleteModality = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    await safeDeleteModality(id, { reassignVersionsTo: req.body?.reassignVersionsTo });
    logger.info("Modality deleted", { modalityId: id });
    res.status(204).json({ status: "success", data: null });
});

exports.getBodyPartsManage = asyncErrorCatching(async (req, res) => {
    const bodyParts = await prisma.bodyPart.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { versions: true } } },
    });
    res.status(200).json({ status: 'success', data: { bodyParts } });
});

exports.getBodyPartImpact = asyncErrorCatching(async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const impact = await getBodyPartImpact(id);
    const bodyParts = await prisma.bodyPart.findMany({
        where: { NOT: { id } },
        select: { id: true, name: true, slug: true },
        orderBy: { name: 'asc' },
    });
    res.status(200).json({
        status: 'success',
        data: { ...impact, reassignOptions: { bodyParts } },
    });
});

exports.getAllBodyParts = asyncErrorCatching(async (req, res, next) => {
    const { data: bodyParts, pagination } = await runTaxonomyQuery(
        prisma.bodyPart,
        req.query,
        generateBodyPartOptions
    );
    res.status(200).json({ status: "success", pagination, data: { bodyParts } });
});

exports.createBodyPart = asyncErrorCatching(async (req, res, next) => {
    const body = parseJSONField(req.body.data) || req.body;
    const { name, slug } = body;
    if (!name || !slug) {
        return next(new createError(400, "Body part name and slug are required"));
    }
    const bodyPart = await prisma.bodyPart.create({ data: { name, slug } });
    logger.info("Body part created", { bodyPartId: bodyPart.id, name, slug });
    res.status(201).json({ status: "success", data: { bodyPart } });
});

exports.updateBodyPart = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    const body = parseJSONField(req.body.data) || req.body;
    const { name, slug } = body;
    const bodyPart = await prisma.bodyPart.update({ where: { id }, data: { name, slug } });
    logger.info("Body part updated", { bodyPartId: id });
    res.status(200).json({ status: "success", data: { bodyPart } });
});

exports.deleteBodyPart = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);
    await safeDeleteBodyPart(id, { reassignVersionsTo: req.body?.reassignVersionsTo });
    logger.info("Body part deleted", { bodyPartId: id });
    res.status(204).json({ status: "success", data: null });
});

async function aggregateModelField(field) {
    const models = await prisma.aiModel.findMany({ select: { [field]: true } });
    const counts = new Map();
    models.forEach((m) => {
        (m[field] || []).forEach((val) => {
            counts.set(val, (counts.get(val) || 0) + 1);
        });
    });
    return counts;
}

exports.searchTags = asyncErrorCatching(async (req, res, next) => {
    const { search, limit } = req.query;
    const take = Math.min(parseInt(limit, 10) || 10, 50);
    const tagCounts = await aggregateModelField("tags");

    let tags = Array.from(tagCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([tag]) => tag);

    if (search) {
        const q = search.toLowerCase();
        tags = tags.filter((t) => t.toLowerCase().includes(q));
    }

    res.status(200).json({ status: "success", data: { tags: tags.slice(0, take) } });
});

exports.searchFeatures = asyncErrorCatching(async (req, res, next) => {
    const { search, limit } = req.query;
    const take = Math.min(parseInt(limit, 10) || 10, 50);
    const rows = await prisma.aiModelFeature.findMany({ select: { feature: true } });
    const counts = new Map();
    rows.forEach((r) => counts.set(r.feature, (counts.get(r.feature) || 0) + 1));

    let features = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
    if (search) {
        const q = search.toLowerCase();
        features = features.filter((f) => f.toLowerCase().includes(q));
    }
    res.status(200).json({ status: "success", data: { features: features.slice(0, take) } });
});

exports.searchMetrics = asyncErrorCatching(async (req, res, next) => {
    const { search, limit } = req.query;
    const take = Math.min(parseInt(limit, 10) || 10, 50);
    const rows = await prisma.aiModelMetric.findMany({ select: { metric: true } });
    const counts = new Map();
    rows.forEach((r) => counts.set(r.metric, (counts.get(r.metric) || 0) + 1));

    let metrics = Array.from(counts.keys()).sort((a, b) => a.localeCompare(b));
    if (search) {
        const q = search.toLowerCase();
        metrics = metrics.filter((m) => m.toLowerCase().includes(q));
    }
    res.status(200).json({ status: "success", data: { metrics: metrics.slice(0, take) } });
});
