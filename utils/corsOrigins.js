const DEFAULT_DEV_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173',
];

const parseOrigins = (value) =>
    String(value || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

const getAllowedOrigins = () => {
    const isDev = process.env.NODE_ENV !== 'production';
    const clientUrl = isDev
        ? (process.env.CLIENT_URL_LOCAL || 'http://127.0.0.1:3000')
        : (process.env.CLIENT_URL || 'https://www.modellink.com');
    const configured = parseOrigins(process.env.CORS_ORIGINS || clientUrl);
    if (isDev) {
        return Array.from(new Set([...configured, ...DEFAULT_DEV_ORIGINS]));
    }

    if (configured.length > 0) {
        return configured;
    }
    
    return [];
};

const createCorsOriginChecker = (allowedOrigins = getAllowedOrigins()) => (origin, callback) => {
    if (!origin) {
        return callback(null, true);
    }
    if (allowedOrigins.length === 0) {
        return callback(new Error('CORS origins are not configured for production'), false);
    }
    if (allowedOrigins.includes(origin)) {
        return callback(null, true);
    }
    return callback(new Error('The CORS policy for this site does not allow access from the specified Origin.'), false);
};

module.exports = {
    DEFAULT_DEV_ORIGINS,
    getAllowedOrigins,
    createCorsOriginChecker,
};
