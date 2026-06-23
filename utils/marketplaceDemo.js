/** Portfolio / public demo: simulate payments & Stripe Connect without real charges. */
const isMarketplaceDemo = () =>
    process.env.MARKETPLACE_DEMO === 'true' || process.env.MARKETPLACE_DEMO === '1';

const useMockPayments = () =>
    process.env.NODE_ENV !== 'production' || isMarketplaceDemo();

const isMockWebhookAllowed = () =>
    process.env.NODE_ENV === 'test'
    || process.env.NODE_ENV === 'docker_development'
    || process.env.NODE_ENV === 'development'
    || isMarketplaceDemo();

module.exports = {
    isMarketplaceDemo,
    useMockPayments,
    isMockWebhookAllowed,
};
