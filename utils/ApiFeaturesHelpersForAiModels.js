const { publicUserFields } = require('./ApiFeaturesHelpersForUsers');

const allowableFields = [
    'id',
    'title',
    'category',
    'indications',
    'modality',
    'bodyPart',
    'fda',
    'fdaUrl',
    'endpointUrl',
    'cover',
    'deliveryTime',
    'desc',
    'price',
    'subscription',
    'payPerClick',
    'revisionNumber',
    'sales',
    'starFrequency',
    'totalStars',
    'createdAt',
    'updatedAt',
    'userId'
];

const defaultSort = { updatedAt: 'desc' };

const exactMatchFields = [
    'id',
    'fda',
    'subscription',
    'payPerClick',
    'userId',
    'sales',
    'price'
];

const searchFields = ['title', 'category', 'indications', 'desc', 'modality', 'bodyPart'];
const fieldConfigs = {};

exports.generateModelOptions = () => ({
    defaultRelations: {
        User: {
            select: publicUserFields
        }
    },
    defaultSort,
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
