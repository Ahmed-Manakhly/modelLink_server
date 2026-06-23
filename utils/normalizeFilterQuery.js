/**
 * Coerce query-string filter values before ApiFeatures.
 * Controllers own type normalization — ApiFeatures stays unchanged.
 */

const FDA_UI_ALIASES = {
    Cleared: 'true',
    Pending: 'false',
    'Not Required': 'false',
};

const BOOLEAN_TRUE = new Set(['true', '1', 'yes']);
const BOOLEAN_FALSE = new Set(['false', '0', 'no']);

/** Client cache-busters and auth tokens — not ApiFeatures filter fields */
const META_QUERY_PARAMS = ['_cb', 'token'];

function stripMetaQueryParams(reqQuery = {}) {
    const filterQuery = { ...reqQuery };
    META_QUERY_PARAMS.forEach((key) => {
        delete filterQuery[key];
    });
    return filterQuery;
}

function coerceBooleanToken(field, rawValue, fieldAliases = {}) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        return rawValue;
    }
    const str = String(rawValue).trim();
    if (fieldAliases[str] !== undefined) {
        return fieldAliases[str];
    }
    if (field === 'versions.fda' || field.endsWith('.fda')) {
        if (FDA_UI_ALIASES[str] !== undefined) {
            return FDA_UI_ALIASES[str];
        }
    }
    const lower = str.toLowerCase();
    if (BOOLEAN_TRUE.has(lower)) return 'true';
    if (BOOLEAN_FALSE.has(lower)) return 'false';
    return str;
}

function coerceIntegerToken(rawValue) {
    if (rawValue === null || rawValue === undefined || rawValue === '') {
        return rawValue;
    }
    const n = parseInt(String(rawValue).trim(), 10);
    return Number.isNaN(n) ? null : String(n);
}

/** Turn `status=A,B` into `{ in: [...] }` for ApiFeatures exact-match (controller layer). */
function parseCommaSeparatedFilter(filterQuery, field) {
    parseMultiValueFilter(filterQuery, field, 'enum');
}

/**
 * Normalize comma-separated filter values for Prisma-safe ApiFeatures input.
 * - enum/string: `A,B` → `{ in: ['A','B'] }`
 * - boolean: `true,false` or both selected → omit filter (match all); single → `'true'` / `'false'`
 */
function parseMultiValueFilter(filterQuery, field, valueType = 'enum') {
    const value = filterQuery[field];
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'object') return;

    const str = String(value).trim();
    if (!str.includes(',')) {
        if (valueType === 'boolean') {
            const coerced = coerceBooleanToken(field, str);
            if (coerced === 'true' || coerced === 'false') {
                filterQuery[field] = coerced;
            } else {
                delete filterQuery[field];
            }
        }
        return;
    }

    const tokens = str.split(',').map((s) => s.trim()).filter(Boolean);
    const unique = [...new Set(tokens)];

    if (valueType === 'boolean') {
        const boolTokens = unique
            .map((token) => coerceBooleanToken(field, token))
            .filter((token) => token === 'true' || token === 'false');
        const uniqueBools = [...new Set(boolTokens)];

        if (uniqueBools.length === 0) {
            delete filterQuery[field];
        } else if (uniqueBools.includes('true') && uniqueBools.includes('false')) {
            delete filterQuery[field];
        } else {
            filterQuery[field] = uniqueBools[0];
        }
        return;
    }

    filterQuery[field] = { in: unique };
}

/**
 * @param {object} reqQuery
 * @param {{ booleanFields?: string[], integerFields?: string[], aliases?: Record<string, Record<string, string>> }} spec
 */
function normalizeFilterQuery(reqQuery = {}, spec = {}) {
    const {
        booleanFields = [],
        integerFields = [],
        aliases = {},
    } = spec;

    const filterQuery = stripMetaQueryParams(reqQuery);

    booleanFields.forEach((field) => {
        if (filterQuery[field] === undefined) return;
        const coerced = coerceBooleanToken(field, filterQuery[field], aliases[field] || {});
        if (coerced === '' || coerced === null || coerced === undefined) {
            delete filterQuery[field];
        } else {
            filterQuery[field] = coerced;
        }
    });

    integerFields.forEach((field) => {
        if (filterQuery[field] === undefined) return;
        const coerced = coerceIntegerToken(filterQuery[field]);
        if (coerced === null || coerced === '' || coerced === undefined) {
            delete filterQuery[field];
        } else {
            filterQuery[field] = coerced;
        }
    });

    return filterQuery;
}

/** Per-resource coercion specs — keep in sync with ApiFeaturesHelpers exact-match + Prisma types */
const FILTER_SPECS = {
    model: {
        booleanFields: [
            'featured',
            'developer.isVerified',
            'versions.fda',
            'versions.isActive',
            'versions.isPrimary',
        ],
        integerFields: [
            'id',
            'categoryId',
            'developerId',
            'versions.id',
            'versions.modalityId',
            'versions.bodyPartId',
            'versions.price',
            'versions.deliveryTime',
            'reviewCount',
            'sales',
            'views',
        ],
        aliases: {
            'versions.fda': FDA_UI_ALIASES,
        },
    },
    user: {
        booleanFields: ['isActive', 'isVerified'],
        integerFields: [],
    },
    order: {
        booleanFields: [],
        integerFields: ['id', 'aiModelId', 'versionId', 'purchasePrice'],
    },
    notification: {
        booleanFields: ['unRead'],
        integerFields: ['id'],
    },
    dispute: {
        booleanFields: [],
        integerFields: ['id', 'orderId'],
    },
    verification: {
        booleanFields: [],
        integerFields: ['id'],
    },
    payout: {
        booleanFields: [],
        integerFields: ['id'],
    },
    walletTransaction: {
        booleanFields: [],
        integerFields: ['id'],
    },
    review: {
        booleanFields: [],
        integerFields: ['id', 'aiModelId', 'orderId'],
    },
    message: {
        booleanFields: [],
        integerFields: ['id', 'conversationId'],
    },
    conversation: {
        booleanFields: [],
        integerFields: ['id'],
    },
    auditLog: {
        booleanFields: [],
        integerFields: ['id'],
    },
    transaction: {
        booleanFields: [],
        integerFields: ['id'],
    },
    webhookEvent: {
        booleanFields: [],
        integerFields: ['id'],
    },
};

module.exports = {
    normalizeFilterQuery,
    FILTER_SPECS,
    FDA_UI_ALIASES,
    coerceBooleanToken,
    coerceIntegerToken,
    parseCommaSeparatedFilter,
    parseMultiValueFilter,
    stripMetaQueryParams,
    META_QUERY_PARAMS,
};
