const allowableFields = ['id', 'name', 'slug'];

const exactMatchFields = ['id', 'slug'];

const searchFields = ['name', 'slug'];

const fieldConfigs = { id: 'integer' };

const defaultSort = { name: 'asc' };

exports.generateModalityOptions = () => ({
    defaultRelations: {},
    defaultSort,
    defaultLimit: 100,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
