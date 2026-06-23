const allowableFields = [
    'id',
    'status',
    'purchasePrice',
    'stripePaymentIntentId',
    'title',
    'img',
    'createdAt',
    'updatedAt',
    'clientId',
    'developerId',
    'aiModelId',
    'versionId',

    // Relations
    'AiModel',
    'AiModelVersion',
    'User_Order_clientIdToUser',
    'User_Order_developerIdToUser',
    'transaction',
    'walletTransactions',
    'review',
    'dispute',

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
    'status',
    'stripePaymentIntentId',
    'clientId',
    'developerId',
    'aiModelId',
    'versionId',
];

const searchFields = ['title', 'status', 'stripePaymentIntentId'];
const fieldConfigs = {
    id: 'integer',
    purchasePrice: 'integer',
    aiModelId: 'integer',
    versionId: 'integer',
    AiModel: 'relation-object',
    AiModelVersion: 'relation-object',
    User_Order_clientIdToUser: 'relation-object',
    User_Order_developerIdToUser: 'relation-object',
    transaction: 'relation-object',
    walletTransactions: 'relation-array',
    review: 'relation-object',
    dispute: 'relation-object'
};

const defaultRelations = {
    User_Order_clientIdToUser: true,
    User_Order_developerIdToUser: true,
    AiModel: true,
    AiModelVersion: { select: { id: true, version: true } },
    dispute: { select: { status: true } },
};

exports.generateOrderOptions = () => ({
    defaultRelations,
    defaultSort,
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
