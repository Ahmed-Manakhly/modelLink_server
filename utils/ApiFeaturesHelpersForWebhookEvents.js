const allowableFields = [
    'id',
    'eventId',
    'eventType',
    'provider',
    'status',
    'failureReason',
    'retryCount',
    'receivedAt',
    'processedAt',
    'search',
    'createdAtFrom',
    'createdAtTo',
];

const exactMatchFields = ['id', 'eventType', 'provider', 'status'];
const searchFields = ['eventId', 'eventType', 'failureReason'];

exports.generateWebhookEventOptions = () => ({
    defaultRelations: {},
    defaultSort: { receivedAt: 'desc' },
    defaultLimit: 15,
    allowableFields,
    exactMatchFields,
    searchFields,
});
