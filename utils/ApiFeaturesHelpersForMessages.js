const allowableFields = [
    'id',
    'desc',
    'createdAt',
    'updatedAt',
    'conversationId',
    'userId',

    // Relations
    'Conversation',
    'User',
];

const defaultSort = { createdAt: 'asc' };

const exactMatchFields = [
    'id',
    'conversationId',
    'userId',
];

const searchFields = ['desc'];
const fieldConfigs = {
    Conversation: 'relation-object',
    User: 'relation-object',
};

const defaultRelations = {
    User: {
        select: {
            id: true,
            org_username: true,
            avatar: true,
            role: true,
        }
    }
};

exports.generateMessageOptions = () => ({
    defaultRelations,
    defaultSort,
    defaultLimit: 1000,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
