const logger = require('./logger');


const commonEnvVars = [
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'SMTP_EMAIL',
    'SMTP_PASSWORD',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'PASSWORD_COMPLEXITY',
    'ACCESS_SECRET_STR',
    'JWT_SECRET',
    'ENCRYPTION_KEY',
    'OTP_EXPIRATION',
    'ACCESS_TOKEN_EXPIRATION',
    'LOG_DIR',
    'PUBLIC_DIR',
    'MAX_FILE_SIZE',
    'ALLOWED_FILE_TYPES',
];

const developmentEnvVars = [
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'ADMIN_NAME',
];

const productionEnvVars = [
    'STRIPE',
    // Webhook secrets are checked conditionally below, but listed here for visibility:
    // 'STRIPE_WEBHOOK_SECRET',
    // 'STRIPE_LOCAL_WEBHOOK_SECRET'
];

const isProduction = () => process.env.NODE_ENV === 'production';

const validateEnvVars = () => {
    const missing = [];
    const required = [...commonEnvVars];

    if (isProduction()) {
        required.push(...productionEnvVars);
    } else {
        required.push(...developmentEnvVars);
    }

    required.forEach((envVar) => {
        // Only validate if not commented out in the array
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    });

    // Custom check for Stripe Webhooks: We need AT LEAST ONE of these to be set in production
    if (isProduction() && !process.env.STRIPE_WEBHOOK_SECRET && !process.env.STRIPE_LOCAL_WEBHOOK_SECRET) {
        missing.push('STRIPE_WEBHOOK_SECRET or STRIPE_LOCAL_WEBHOOK_SECRET');
    }

    if (isProduction() && !process.env.CORS_ORIGINS && !process.env.CLIENT_URL) {
        missing.push('CORS_ORIGINS or CLIENT_URL');
    }

    if (missing.length > 0) {
        logger.error({ missing: missing.join(', ') }, 'Missing required environment variables');
        process.exit(1);
    }

    logger.info('All required environment variables are set');
};

module.exports = { validateEnvVars };
