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
    avatar: true,
    logoUrl: true,
    role: true,
    isVerified: true,
    isActive: true,
    stripeCustomerId: true,
    stripeAccountId: true,
    stripeChargesEnabled: true,
    stripeDetailsSubmitted: true,
    total_orders: true,
    lastLogin: true,
    createdAt: true,
    updatedAt: true
};

const publicUserFields = {
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
    avatar: true,
    logoUrl: true,
    role: true,
    isVerified: true,
    total_orders: true,
    createdAt: true,
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
    'avatar',
    'logoUrl',
    'role',
    'isActive',
    'isVerified',
    'stripeCustomerId',
    'stripeAccountId',
    'total_orders',
    'lastLogin',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'failed_attempts',
    'lockup',
    'password_change',

    // Wallet relation & fields
    'wallet',
    'wallet.id',
    'wallet.availableBalance',
    'wallet.pendingBalance',
    'wallet.totalEarnings',
    'wallet.userId',

    // Verification relation & fields
    'verification',
    'verification.id',
    'verification.userId',
    'verification.status',
    'verification.documentUrl',
    'verification.notes',
    'verification.rejectionReason',
    'verification.verifiedAt',

    // Count selections
    '_count',
    '_count.AiModel',
    '_count.Review',
    '_count.conversationParticipants',
    '_count.Message',
    '_count.openedDisputes',
    '_count.notificationsReceived',
    '_count.notificationsSent',
    '_count.payouts',
    '_count.Order_Order_clientIdToUser',
    '_count.Order_Order_developerIdToUser',

    // Global query params
    'search',
    'createdAtRule',
    'updatedAtRule',
    'createdAtFrom',
    'createdAtTo',
    'updatedAtFrom',
    'updatedAtTo',
];

const defaultSort = { createdAt: 'asc' };
const exactMatchFields = [
    'id',
    'customId',
    'role',
    'email',
    'org_username',
    'isActive',
    'isVerified',
    'stripeCustomerId',
    'stripeAccountId',
    'createdAt',
    'updatedAt',
    'wallet.id',
    'verification.id',
    'verification.status',
];

const searchFields = ['email', 'org_username', 'first_name', 'last_name', 'org_name'];
const fieldConfigs = {
    wallet: 'relation-object',
    verification: 'relation-object',
    payouts: 'relation-array',
    AiModel: 'relation-array',
    Review: 'relation-array',
    AuditLog: 'relation-array',
    conversationParticipants: 'relation-array',
    Message: 'relation-array',
    openedDisputes: 'relation-array',
    notificationsReceived: 'relation-array',
    notificationsSent: 'relation-array',
    Order_Order_clientIdToUser: 'relation-array',
    Order_Order_developerIdToUser: 'relation-array'
};

exports.generateOptions = () => ({
    defaultRelations: {},
    defaultSort,
    defaultLimit: 12,
    allowableFields,
    exactMatchFields,
    fieldConfigs,
    searchFields,
});
exports.safeUserFields = safeUserFields;
exports.publicUserFields = publicUserFields;