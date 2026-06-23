const allowableFields = [
    'id',
    'actionDesc',
    'type',
    'unRead',
    'actionLink',
    'createdAt',
    'readAt',
    'recipientId',
    'senderId',

    // Relations
    'recipient',
    'sender',

    // Global filters
    'search',
    'createdAtRule',
    'createdAtFrom',
    'createdAtTo',
];

const defaultSort = { createdAt: 'desc' };

const exactMatchFields = [
    'id',
    'type',
    'unRead',
    'recipientId',
    'senderId',
];

const searchFields = ['actionDesc'];
const fieldConfigs = {
    id: 'integer',
    recipient: 'relation-object',
    sender: 'relation-object',
};

const defaultRelations = {
    sender: {
        select: {
            id: true,
            org_username: true,
            avatar: true,
        }
    }
};

exports.generateNotificationOptions = () => ({
    defaultRelations,
    defaultSort,
    defaultLimit: 20,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
