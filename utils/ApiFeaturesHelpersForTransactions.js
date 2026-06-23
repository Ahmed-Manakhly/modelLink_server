const allowableFields = [
    'id',
    'stripeEventId',
    'grossAmount',
    'platformFee',
    'developerPayout',
    'currency',
    'createdAt',
    'orderId',

    // Relations
    'order',

    // Global filters
    'search',
    'createdAtRule',
    'createdAtFrom',
    'createdAtTo'
];

const defaultSort = { createdAt: 'desc' };

const exactMatchFields = [
    'id',
    'stripeEventId',
    'orderId'
];

const searchFields = ['stripeEventId', 'currency'];
const fieldConfigs = {
    order: 'relation-object'
};

const defaultRelations = {};

exports.generateTransactionOptions = () => ({
    defaultRelations,
    defaultSort,
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields
});
