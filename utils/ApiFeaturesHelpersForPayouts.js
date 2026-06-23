const { publicUserFields } = require('./ApiFeaturesHelpersForUsers');

const allowableFields = [
    'id',
    'amount',
    'status',
    'stripeTransferId',
    'note',
    'adminNote',
    'createdAt',
    'userId',
    'user.id',
    'user.first_name',
    'user.last_name',
    'user.email',
    'user.org_username',
    'user.avatar',
    'user.org_name'
];

const exactMatchFields = ['id', 'status', 'userId'];
const searchFields = ['status', 'stripeTransferId', 'user.org_username', 'user.email'];

const fieldConfigs = {
    user: 'relation-object'
};

const defaultRelations = {
    user: {
        select: publicUserFields
    }
};

exports.generatePayoutOptions = () => ({
    defaultRelations,
    defaultSort: { createdAt: 'desc' },
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields
});
