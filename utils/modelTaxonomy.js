const prisma = require('../prisma/prisma');
const { normalizeFilterQuery, FILTER_SPECS } = require('./normalizeFilterQuery');

const MEDICAL_PARENT_SLUGS = new Set([
    'medical-imaging',
    'clinical-decision-support',
    'telemedicine-remote-monitoring',
    'pathology-histopathology',
    'genomics-personalized-medicine',
    'medical-ai',
]);

exports.isMedicalCategoryId = async (categoryId) => {
    const cat = await prisma.category.findUnique({
        where: { id: parseInt(categoryId, 10) },
        include: { parent: true },
    });
    if (!cat) return false;
    if (cat.parent && MEDICAL_PARENT_SLUGS.has(cat.parent.slug)) return true;
    if (MEDICAL_PARENT_SLUGS.has(cat.slug)) return true;
    return false;
};

exports.assertSubcategoryId = async (categoryId) => {
    const cat = await prisma.category.findUnique({ where: { id: parseInt(categoryId, 10) } });
    if (!cat) return { ok: false, message: 'Selected category does not exist.' };
    if (cat.parentId === null) {
        return { ok: false, message: 'Please select a subcategory, not a parent navigation group.' };
    }
    return { ok: true, category: cat };
};

exports.resolveTaxonomyId = async (model, idOrName) => {
    if (idOrName === undefined || idOrName === null || idOrName === '') return null;
    const asInt = parseInt(idOrName, 10);
    if (!Number.isNaN(asInt)) {
        const byId = await prisma[model].findUnique({ where: { id: asInt } });
        if (byId) return byId.id;
    }
    const byName = await prisma[model].findFirst({
        where: {
            OR: [
                { name: { equals: String(idOrName), mode: 'insensitive' } },
                { slug: { equals: String(idOrName), mode: 'insensitive' } },
            ],
        },
    });
    return byName?.id ?? null;
};

exports.normalizeModelFilterQuery = (reqQuery = {}) => {
    const filterQuery = normalizeFilterQuery(reqQuery, FILTER_SPECS.model);
    if (filterQuery.category) {
        filterQuery['categoryRel.name'] = filterQuery.category;
        delete filterQuery.category;
    }
    return filterQuery;
};

/** Resolve parent category slug → child category IDs for group filtering */
exports.getChildCategoryIdsByParentSlug = async (parentSlug) => {
    if (!parentSlug) return [];
    const children = await prisma.category.findMany({
        where: { parent: { slug: parentSlug } },
        select: { id: true },
    });
    return children.map((c) => c.id);
};
