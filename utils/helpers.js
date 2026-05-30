const createError = require('./createError');
const errorMessages = require('./errorMessages');
// ==================== Helpers ====================
const deepParseJSON = (obj) => {
    if (typeof obj === 'string') {
        try {
            if (/^[\{\[]/.test(obj.trim())) {
                const parsed = JSON.parse(obj)
                return deepParseJSON(parsed)
            }
            return obj
        } catch (error) {
            throw new createError(400, `${errorMessages.SOMETHING_WENT_WRONG} (${error.message})`)
        }
    }

    if (Array.isArray(obj)) {
        return obj.map(deepParseJSON)
    }

    if (obj && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, deepParseJSON(value)])
        )
    }
    return obj
}
const parseJSONField = (field) => {
    if (!field) return null
    if (typeof field !== 'string') return field

    try {
        return deepParseJSON(field)
    } catch (error) {
        throw new createError(400, `${errorMessages.SOMETHING_WENT_WRONG} (${error.message})`)
    }
}
const getFile = (files, field) => files?.[field]?.[0]?.filename
const getFiles = (files, field) => files?.[field]?.map(f => f.filename) || []
// ==================== Validation Helpers ====================
const validateRequired = (data, fields) => {
    const missing = fields.filter(field => {
        const value = data[field];
        // Special handling for booleans (false is valid)
        if (typeof value === 'boolean') {
            return value === undefined || value === null;
        }
        // Handle arrays
        if (Array.isArray(value)) {
            return value.length === 0;
        }
        // Handle other types (null, undefined, or empty string)
        return value === null || value === undefined || value === '';
    });
    if (missing.length > 0) {
        throw new createError(400, `Missing required fields: ${missing.join(', ')}`);
    }
};

// ---------------- Export ----------------
module.exports = {
    deepParseJSON,
    parseJSONField,
    getFile,
    getFiles,
    validateRequired
};