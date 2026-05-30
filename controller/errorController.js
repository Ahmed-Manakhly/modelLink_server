const CreateError = require('../utils/createError');
const errorMessages = require("../utils/errorMessages");
const logger = require('../utils/logger');

/**
 * function: handlePrismaError
 * @description: Handles known Prisma database errors
 */
const handlePrismaError = (error) => {
    let msg = errorMessages.SOMETHING_WENT_WRONG;
    if (error.code === "P2002") {
        // Unique constraint violation
        const field = error.meta && error.meta.target ? error.meta.target : 'field';
        msg = `The "${field}" field must be unique. Please try a different value!`;
        return new CreateError(400, msg);
    }
    if (error.code === "P2025") {
        // Record not found
        msg = "The requested record does not exist!";
        return new CreateError(404, msg);
    }
    if (error.code === "P2021") {
        // Table does not exist
        msg = "Database table does not exist. Did you run migrations?";
        return new CreateError(500, msg);
    }
    if (error.code === "P2003") {
        // Foreign key constraint failure
        msg = "Invalid reference, a related record is missing!";
        return new CreateError(400, msg);
    }
    return new CreateError(500, msg);
};

const handleJWTError = () => new CreateError(401, errorMessages.INVALID_TOKEN);
const handleJWTExpiredError = () => new CreateError(401, errorMessages.TOKEN_EXPIRED);

const sendErrorDev = (err, req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        return res.status(err.statusCode).json({
            status: err.status,
            error: err,
            stack: err.stack,
            message: err.message
        });
    } else {
        return res.status(err.statusCode).render('website/404', {
            title: errorMessages.SOMETHING_WENT_WRONG,
            msg: err.message
        });
    }
};

const sendErrorProd = (err, req, res) => {
    if (req.originalUrl.startsWith('/api')) {
        // Operational, trusted error: send message to client
        if (err.isOperational) {
            return res.status(err.statusCode).json({
                status: err.status,
                message: err.message
            });
        }
        // Programming or other unknown error: don't leak error details
        else {
            return res.status(500).json({
                status: 'error',
                message: errorMessages.SOMETHING_WENT_WRONG
            });
        }
    } else {
        return res.status(err.statusCode).render('website/404', {
            title: errorMessages.SOMETHING_WENT_WRONG,
            msg: err.message
        });
    }
};

module.exports = (err, req, res, next) => {
    // Check if response has already been sent
    if (res.headersSent) {
        return next(err);
    }

    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    // Create a mutable copy of the error for transformation if necessary
    let error = { ...err };
    error.message = err.message;
    error.stack = err.stack;
    error.name = err.name;
    error.isOperational = err.isOperational || false;
    error.code = err.code;
    error.meta = err.meta;

    // Prisma Error Handling
    if (err instanceof require('@prisma/client').Prisma.PrismaClientKnownRequestError) {
        error = handlePrismaError(err);
    }
    if (err instanceof require('@prisma/client').Prisma.PrismaClientValidationError) {
        error = new CreateError(400, "Invalid data provided. Please check your input values.");
    }
    if (err instanceof require('@prisma/client').Prisma.PrismaClientInitializationError) {
        error = new CreateError(500, "Database connection failed. Please check your DB setup.");
    }

    // JWT Error Handling
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    // Smart Logging
    const logMeta = {
        requestId: req.id || req.requestId || 'unknown',
        userCustomId: req?.user?.customId || `New User`,
        username: req?.user?.org_username || `New User`,
        role: req?.user?.role || `New User`,
        statusCode: error.statusCode,
        status: error.status,
        event: "errorResponse"
    };

    if (!error.isOperational) {
        logger.error({
            ...logMeta,
            message: error.message,
            errorStack: error.stack,
        }, 'Unhandled exception error');
    } else {
        logger.warn({
            ...logMeta,
            message: error.message,
        }, 'Operational error');
    }

    if (process.env.NODE_ENV === "development") {
        sendErrorDev(error, req, res);
    } else if (process.env.NODE_ENV === "production") {
        sendErrorProd(error, req, res);
    } else {
        // Fallback
        sendErrorDev(error, req, res);
    }
};
