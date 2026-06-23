const { publicUserFields } = require('./ApiFeaturesHelpersForUsers');

const allowableFields = [
    'id',
    'actionType',
    'targetId',
    'reason',
    'createdAt',
    'adminId',
    'Admin.id',
    'Admin.first_name',
    'Admin.last_name',
    'Admin.email',
    'Admin.org_username'
];

const exactMatchFields = ['id', 'actionType', 'adminId'];
const searchFields = ['actionType', 'reason', 'Admin.org_username'];

const fieldConfigs = {
    Admin: 'relation-object'
};

const defaultRelations = {
    Admin: {
        select: publicUserFields
    }
};

exports.generateAuditLogOptions = () => ({
    defaultRelations,
    defaultSort: { createdAt: 'desc' },
    defaultLimit: 25,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields
});
