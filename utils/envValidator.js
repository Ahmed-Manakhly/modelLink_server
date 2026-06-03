const logger = require('./logger');

const requiredEnvVars = [
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_DB',
    'PGDATA',
    'PGADMIN_DEFAULT_EMAIL',
    'PGADMIN_DEFAULT_PASSWORD',
    'NODE_ENV',
    'PORT',
    'DATABASE_URL',
    'SMTP_EMAIL',
    'SMTP_PASSWORD',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'PASSWORD_COMPLEXITY',
    'ACCESS_SECRET_STR',
    'OTP_EXPIRATION',
    'ACCESS_TOKEN_EXPIRATION',
    'LOG_DIR',
    'PUBLIC_DIR',
    'MAX_FILE_SIZE',
    'ALLOWED_FILE_TYPES',
    'ADMIN_EMAIL',
    'ADMIN_PASSWORD',
    'ADMIN_NAME',
];

const validateEnvVars = () => {
    const missing = [];

    requiredEnvVars.forEach(envVar => {
        if (!process.env[envVar]) {
            missing.push(envVar);
        }
    });

    if (missing.length > 0) {
        logger.error({ missing: missing.join(', ') }, 'Missing required environment variables');
        process.exit(1);
    }

    logger.info('All required environment variables are set');
};

module.exports = { validateEnvVars };
