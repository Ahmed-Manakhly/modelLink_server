const allowableFields = [
    'id',
    'name',
    'slug',
    'svg',
    'parentId',
];

const exactMatchFields = ['id', 'parentId', 'slug'];

const searchFields = ['name', 'slug'];

const fieldConfigs = {
    id: 'integer',
    parentId: 'integer',
};

const defaultSort = { name: 'asc' };

exports.generateCategoryOptions = ({ includeChildren = true } = {}) => ({
    defaultRelations: includeChildren
        ? { children: { orderBy: { name: 'asc' } } }
        : { parent: { select: { id: true, name: true, slug: true } } },
    defaultSort,
    defaultLimit: 100,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
