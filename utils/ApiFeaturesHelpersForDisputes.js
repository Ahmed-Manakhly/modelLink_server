const { publicUserFields } = require('./ApiFeaturesHelpersForUsers');

const allowableFields = [
    'id',
    'status',
    'reason',
    'resolution',
    'openedById',
    'orderId',
    'createdAt',

    // Relations
    'openedBy.id',
    'openedBy.first_name',
    'openedBy.last_name',
    'openedBy.email',
    'openedBy.org_username',
    'openedBy.avatar',

    'order.id',
    'order.status',
    'order.purchasePrice',
    'order.title',
    'order.clientId',
    'order.developerId'
];

const exactMatchFields = ['id', 'status', 'openedById', 'orderId', 'order.clientId', 'order.developerId'];
const searchFields = ['status', 'reason', 'resolution', 'openedBy.org_username', 'order.title'];

const fieldConfigs = {
    openedBy: 'relation-object',
    order: 'relation-object'
};

const defaultRelations = {
    openedBy: {
        select: publicUserFields
    },
    order: {
        include: {
            User_Order_clientIdToUser: { select: publicUserFields },
            User_Order_developerIdToUser: { select: publicUserFields }
        }
    }
};

exports.generateDisputeOptions = () => ({
    defaultRelations,
    defaultSort: { createdAt: 'desc' },
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields
});
