const prisma = require('../prisma/prisma');
const createError = require('./createError');

async function assertValidParentCategoryId(parentId) {
    if (parentId === null || parentId === undefined || parentId === '') return null;
    const id = parseInt(parentId, 10);
    if (Number.isNaN(id)) {
        throw new createError(400, 'Invalid parent category id.');
    }
    const parent = await prisma.category.findUnique({ where: { id } });
    if (!parent) {
        throw new createError(400, 'Parent category does not exist.');
    }
    if (parent.parentId !== null) {
        throw new createError(400, 'Parent must be a top-level category group.');
    }
    return id;
}

async function assertValidSubcategoryId(categoryId) {
    const id = parseInt(categoryId, 10);
    if (Number.isNaN(id)) {
        throw new createError(400, 'Invalid category id for reassignment.');
    }
    const cat = await prisma.category.findUnique({ where: { id } });
    if (!cat) {
        throw new createError(404, 'Reassignment category does not exist.');
    }
    if (cat.parentId === null) {
        throw new createError(400, 'Models must be reassigned to a subcategory, not a parent group.');
    }
    return cat;
}

async function getCategoryImpact(id) {
    const category = await prisma.category.findUnique({
        where: { id },
        include: {
            parent: { select: { id: true, name: true, slug: true } },
            children: { select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' } },
            _count: { select: { models: true, children: true } },
        },
    });
    if (!category) {
        throw new createError(404, 'Category not found.');
    }
    return {
        category,
        modelCount: category._count.models,
        childCount: category._count.children,
        isParentGroup: category.parentId === null,
    };
}

async function safeDeleteCategory(id, { reassignModelsTo, reassignChildrenTo } = {}) {
    const impact = await getCategoryImpact(id);

    if (impact.childCount > 0 && reassignChildrenTo === undefined) {
        throw new createError(
            409,
            `Cannot delete: ${impact.childCount} subcategor${impact.childCount === 1 ? 'y belongs' : 'ies belong'} to this parent. Reassign subcategories first.`
        );
    }

    if (impact.modelCount > 0 && (reassignModelsTo === undefined || reassignModelsTo === null || reassignModelsTo === '')) {
        throw new createError(
            409,
            `Cannot delete: ${impact.modelCount} model(s) use this category. Choose a subcategory to reassign them to.`
        );
    }

    await prisma.$transaction(async (tx) => {
        if (impact.childCount > 0) {
            let newParentId = null;
            if (reassignChildrenTo !== null && reassignChildrenTo !== '') {
                newParentId = await assertValidParentCategoryId(reassignChildrenTo);
            }
            await tx.category.updateMany({
                where: { parentId: id },
                data: { parentId: newParentId },
            });
        }

        if (impact.modelCount > 0) {
            const target = await assertValidSubcategoryId(reassignModelsTo);
            if (target.id === id) {
                throw new createError(400, 'Cannot reassign models to the category being deleted.');
            }
            await tx.aiModel.updateMany({
                where: { categoryId: id },
                data: {
                    categoryId: target.id,
                    category: target.name,
                },
            });
        }

        await tx.category.delete({ where: { id } });
    });
}

async function getModalityImpact(id) {
    const modality = await prisma.modality.findUnique({
        where: { id },
        include: { _count: { select: { versions: true } } },
    });
    if (!modality) throw new createError(404, 'Modality not found.');
    return { modality, versionCount: modality._count.versions };
}

async function safeDeleteModality(id, { reassignVersionsTo } = {}) {
    const impact = await getModalityImpact(id);
    if (impact.versionCount > 0 && (reassignVersionsTo === undefined || reassignVersionsTo === null || reassignVersionsTo === '')) {
        throw new createError(
            409,
            `Cannot delete: ${impact.versionCount} model version(s) use this modality. Choose another modality to reassign them to.`
        );
    }

    await prisma.$transaction(async (tx) => {
        if (impact.versionCount > 0) {
            const targetId = parseInt(reassignVersionsTo, 10);
            const target = await tx.modality.findUnique({ where: { id: targetId } });
            if (!target) throw new createError(404, 'Reassignment modality does not exist.');
            if (target.id === id) throw new createError(400, 'Cannot reassign to the modality being deleted.');
            await tx.aiModelVersion.updateMany({
                where: { modalityId: id },
                data: { modalityId: target.id },
            });
        }
        await tx.modality.delete({ where: { id } });
    });
}

async function getBodyPartImpact(id) {
    const bodyPart = await prisma.bodyPart.findUnique({
        where: { id },
        include: { _count: { select: { versions: true } } },
    });
    if (!bodyPart) throw new createError(404, 'Body part not found.');
    return { bodyPart, versionCount: bodyPart._count.versions };
}

async function safeDeleteBodyPart(id, { reassignVersionsTo } = {}) {
    const impact = await getBodyPartImpact(id);
    if (impact.versionCount > 0 && (reassignVersionsTo === undefined || reassignVersionsTo === null || reassignVersionsTo === '')) {
        throw new createError(
            409,
            `Cannot delete: ${impact.versionCount} model version(s) use this body part. Choose another body part to reassign them to.`
        );
    }

    await prisma.$transaction(async (tx) => {
        if (impact.versionCount > 0) {
            const targetId = parseInt(reassignVersionsTo, 10);
            const target = await tx.bodyPart.findUnique({ where: { id: targetId } });
            if (!target) throw new createError(404, 'Reassignment body part does not exist.');
            if (target.id === id) throw new createError(400, 'Cannot reassign to the body part being deleted.');
            await tx.aiModelVersion.updateMany({
                where: { bodyPartId: id },
                data: { bodyPartId: target.id },
            });
        }
        await tx.bodyPart.delete({ where: { id } });
    });
}

module.exports = {
    assertValidParentCategoryId,
    getCategoryImpact,
    safeDeleteCategory,
    getModalityImpact,
    safeDeleteModality,
    getBodyPartImpact,
    safeDeleteBodyPart,
};
