const { publicUserFields } = require('./ApiFeaturesHelpersForUsers');

const verificationUserFields = {
    ...publicUserFields,
    email: true,
};

const allowableFields = [
    'id',
    'status',
    'documentUrl',
    'notes',
    'rejectionReason',
    'verifiedAt',
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
const searchFields = ['status', 'notes', 'rejectionReason', 'user.org_username', 'user.email'];

const fieldConfigs = {
    user: 'relation-object'
};

const defaultRelations = {
    user: {
        select: verificationUserFields
    }
};

exports.generateVerificationOptions = () => ({
    defaultRelations,
    defaultSort: { id: 'desc' },
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields
});
