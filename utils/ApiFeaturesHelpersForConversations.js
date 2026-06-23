const allowableFields = [
    'id',
    'lastMessage',
    'unReadMsg',
    'createdAt',
    'updatedAt',
    'deletedAt',

    // Relations
    'participants',
    'participants.userId',
    'messages',
];

const defaultSort = { updatedAt: 'desc' };

const exactMatchFields = [
    'id',
    'participants.userId',
];

const searchFields = ['lastMessage'];
const fieldConfigs = {
    participants: 'relation-array',
    messages: 'relation-array',
};

const defaultRelations = {
    participants: {
        select: {
            userId: true,
            hasRead: true,
            isHidden: true,
            user: {
                select: {
                    id: true,
                    org_username: true,
                    avatar: true,
                    first_name: true,
                    role: true,
                    isActive: true,
                    deletedAt: true,
                }
            }
        }
    }
};

exports.generateConversationOptions = () => ({
    defaultRelations,
    defaultSort,
    defaultLimit: 50,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
