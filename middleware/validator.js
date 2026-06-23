const createError = require("../utils/createError");

exports.validateCreateAiModel = (req, res, next) => {
    let data;
    try {
        data = req.body.data ? (typeof req.body.data === 'string' ? JSON.parse(req.body.data) : req.body.data) : req.body;
    } catch (err) {
        return next(new createError(400, "Validation failed: Invalid JSON in request body."));
    }

    const requiredFields = ['title', 'categoryId', 'price', 'desc', 'version'];

    const missingFields = [];
    for (const field of requiredFields) {
        if (data[field] === undefined || data[field] === null || String(data[field]).trim() === '') {
            missingFields.push(field);
        }
    }

    if (missingFields.length > 0) {
        return next(new createError(400, `Validation failed: Missing or empty fields: ${missingFields.join(', ')}`));
    }

    const price = parseFloat(data.price);
    if (isNaN(price) || price <= 0) {
        return next(new createError(400, "Validation failed: Price must be a positive number."));
    }

    if (data.galleryImages !== undefined && data.galleryImages !== null) {
        if (!Array.isArray(data.galleryImages)) {
            return next(new createError(400, "Validation failed: galleryImages must be an array."));
        }
        for (const img of data.galleryImages) {
            if (typeof img !== 'string' || img.trim() === '') {
                return next(new createError(400, "Validation failed: All galleryImages elements must be non-empty strings."));
            }
        }
    }

    if (data.features !== undefined && data.features !== null) {
        if (!Array.isArray(data.features)) {
            return next(new createError(400, "Validation failed: features must be an array."));
        }
        for (const feat of data.features) {
            if (typeof feat === 'string') {
                if (feat.trim() === '') {
                    return next(new createError(400, "Validation failed: All features must be non-empty strings."));
                }
            } else if (feat && typeof feat === 'object') {
                if (!feat.feature || typeof feat.feature !== 'string' || feat.feature.trim() === '') {
                    return next(new createError(400, "Validation failed: Features object must contain a non-empty 'feature' string."));
                }
            } else {
                return next(new createError(400, "Validation failed: Invalid feature format."));
            }
        }
    }

    if (data.metrics !== undefined && data.metrics !== null) {
        if (!Array.isArray(data.metrics)) {
            return next(new createError(400, "Validation failed: metrics must be an array."));
        }
        for (const metric of data.metrics) {
            if (!metric || typeof metric !== 'object' || !metric.metric || typeof metric.metric !== 'string' || metric.metric.trim() === '') {
                return next(new createError(400, "Validation failed: All metrics must contain a non-empty 'metric' string name."));
            }
        }
    }

    next();
};
