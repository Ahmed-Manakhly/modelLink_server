/**
 * Normalizes taxonomy list query params for ApiFeatures.
 * - parentId=null  → navbar parents (nested children via defaultRelations)
 * - subcategoriesOnly=true → leaf categories for developer forms (excludes parents)
 */
const prepareTaxonomyFilterQuery = (reqQuery = {}) => {
    const filterQuery = { ...reqQuery };
    let presetWhere = null;
    let includeChildren = true;

    if (filterQuery.subcategoriesOnly === 'true') {
        presetWhere = { parentId: { not: null } };
        includeChildren = false;
        delete filterQuery.subcategoriesOnly;
    } else if (filterQuery.parentId === 'null' || filterQuery.parentId === '') {
        filterQuery.parentId = null;
        presetWhere = { parentId: null };
        includeChildren = true;
    }

    // Back-compat alias used by model filters / legacy clients
    if (filterQuery.category) {
        filterQuery.name = filterQuery.category;
        delete filterQuery.category;
    }

    return { filterQuery, presetWhere, includeChildren };
};
exports.prepareTaxonomyFilterQuery = prepareTaxonomyFilterQuery;

const mergePresetWhere = (apiFeaturesQuery, presetWhere) => {
    if (!presetWhere) return apiFeaturesQuery;
    apiFeaturesQuery.where = apiFeaturesQuery.where || { AND: [] };
    apiFeaturesQuery.where.AND.push(presetWhere);
    return apiFeaturesQuery;
};
exports.mergePresetWhere = mergePresetWhere;

const ApiFeatures = require('./ApiFeatures');
const createError = require('./createError');
const { generateCategoryOptions } = require('./ApiFeaturesHelpersForCategories');
const { generateModalityOptions } = require('./ApiFeaturesHelpersForModalities');
const { generateBodyPartOptions } = require('./ApiFeaturesHelpersForBodyParts');

exports.runTaxonomyQuery = async (model, reqQuery, optionsFactory) => {
    const { filterQuery, presetWhere, includeChildren } = prepareTaxonomyFilterQuery(reqQuery);
    const options = typeof optionsFactory === 'function'
        ? optionsFactory({ includeChildren })
        : optionsFactory;

    const queryBuilder = new ApiFeatures(model, filterQuery, options);
    if (presetWhere) {
        mergePresetWhere(queryBuilder.query, presetWhere);
    }

    const { data, pagination, error } = await queryBuilder.execute();
    if (error) throw new createError(400, error);
    return { data, pagination };
};

exports.runCategoryQuery = (reqQuery) =>
    exports.runTaxonomyQuery(
        require('../prisma/prisma').category,
        reqQuery,
        ({ includeChildren }) => generateCategoryOptions({ includeChildren })
    );

exports.runModalityQuery = (reqQuery) =>
    exports.runTaxonomyQuery(require('../prisma/prisma').modality, reqQuery, generateModalityOptions);

exports.runBodyPartQuery = (reqQuery) =>
    exports.runTaxonomyQuery(require('../prisma/prisma').bodyPart, reqQuery, generateBodyPartOptions);
