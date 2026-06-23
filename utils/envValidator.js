const logger = require('./logger');
const { isMarketplaceDemo } = require('./marketplaceDemo');

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
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
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

    if (isProduction() && isMarketplaceDemo()) {
        const demoOptional = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'];
        demoOptional.forEach((name) => {
            const idx = required.indexOf(name);
            if (idx !== -1) required.splice(idx, 1);
        });
    }

    required.forEach((envVar) => {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    });

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
