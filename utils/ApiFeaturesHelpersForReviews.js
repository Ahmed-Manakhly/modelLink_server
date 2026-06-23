const allowableFields = [
    'id',
    'desc',
    'star',
    'createdAt',
    'updatedAt',
    'clientId',
    'aiModelId',
    'orderId',
    'versionId',

    // Relations
    'AiModel',
    'AiModelVersion',
    'User',
    'Order',

    // Global filters
    'search',
    'createdAtRule',
    'updatedAtRule',
    'createdAtFrom',
    'createdAtTo',
    'updatedAtFrom',
    'updatedAtTo',
];

const defaultSort = { createdAt: 'desc' };

const exactMatchFields = [
    'id',
    'star',
    'clientId',
    'aiModelId',
    'orderId',
    'versionId',
];

const searchFields = ['desc'];
const fieldConfigs = {
    id: 'integer',
    star: 'integer',
    aiModelId: 'integer',
    orderId: 'integer',
    versionId: 'integer',
    AiModel: 'relation-object',
    AiModelVersion: 'relation-object',
    User: 'relation-object',
    Order: 'relation-object'
};

const defaultRelations = {
    User: true,
    AiModel: true,
    Order: true,
};

exports.generateReviewOptions = () => ({
    defaultRelations,
    defaultSort,
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
