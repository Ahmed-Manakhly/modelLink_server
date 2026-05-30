const safeUserFields = {
        id: true,
        customId: true,
        first_name: true,
        last_name: true,
        org_username: true,
        org_name: true,
        email: true,
        org_phone: true,
        country: true,
        org_desc: true,
        org_aet: true,
        org_ipAddress: true,
        avatar: true,
        role: true,
        isActive: true,
        rule_id: true,
        target_id: true,
        module_id: true,
        createdAt: true,
        updatedAt: true
};

const allowableFields = [
        'id',
        'customId',
        'first_name',
        'last_name',
        'org_username',
        'org_name',
        'email',
        'org_phone',
        'country',
        'org_desc',
        'org_aet',
        'org_ipAddress',
        'role',
        'isActive',
        'rule_id',
        'target_id',
        'module_id',
        'createdAt',
        'updatedAt'
];

const defaultSort = { createdAt: 'asc' };
const exactMatchFields = [
        'id',
        'customId',
        'role',
        'email',
        'org_username',
        'isActive',
        'rule_id',
        'target_id',
        'module_id',
        'createdAt',
        'updatedAt',
];

const searchFields = ['name', 'email']; // allow searching by name/email
const fieldConfigs = {}; // no arrays in User (unless you add relations later)


exports.generateOptions = () => ({
        defaultRelations: {}, // if you want relations like `posts`, include here
        defaultSort,
        defaultLimit: 12,
        allowableFields,
        exactMatchFields,
        fieldConfigs,
        searchFields,
});
exports.safeUserFields = safeUserFields;