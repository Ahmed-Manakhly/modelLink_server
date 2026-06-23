const allowableFields = [
    'id',
    'type',
    'amount',
    'description',
    'referenceId',
    'referenceType',
    'createdAt',
    'walletId',
    'orderId',
    'payoutId'
];

const exactMatchFields = ['id', 'type', 'walletId', 'orderId', 'payoutId'];
const searchFields = ['type', 'description', 'referenceId'];

exports.generateWalletTransactionOptions = () => ({
    defaultRelations: {},
    defaultSort: { createdAt: 'desc' },
    defaultLimit: 15,
    allowableFields,
    exactMatchFields,
    searchFields
});
