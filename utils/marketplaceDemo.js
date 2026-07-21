/**
 * Stripe mock/demo helpers.
 *
 * MARKETPLACE_DEMO flag has been removed.
 * Payment mode is now chosen by the user at checkout (real vs demo button),
 * not by an env var toggle.
 *
 * isMockWebhookAllowed() is retained to block unsigned webhooks in production
 * when STRIPE_WEBHOOK_SECRET is not configured.
 */

const isMockWebhookAllowed = () =>
    process.env.NODE_ENV === 'test'
    || process.env.NODE_ENV === 'docker_development'
    || process.env.NODE_ENV === 'development';

module.exports = {
    isMockWebhookAllowed,
};
