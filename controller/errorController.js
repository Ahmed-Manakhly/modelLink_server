const CreateError = require('../utils/createError');
const errorMessages = require("../utils/errorMessages");



/**
 * function: handleJWTError
 * @returns {CreateError}
 * @description: This function handles the invalidJWT error
 */
const handleJWTError = () => new CreateError(errorMessages.INVALID_TOKEN, 401);


/**
 * function: handleJWTExpiredError
 * @returns {CreateError}
 * @description: This function handles the expired JWT error
 */
const handleJWTExpiredError = () => new CreateError(errorMessages.TOKEN_EXPIRED, 401);


/**
 * function: sendErrorDev
 * @param err - error object
 * @param req - request object
 * @param res - response object
 * @description: This function sends the error in development mode
 */
const sendErrorDev = (err, req, res) => {

    req.logger.error({
        userCustomId: req?.user?.customId || `New User`,
        username: req?.user?.org_username || `New User`,
        role: req?.user?.role | `New User`,
        event: "sendErrorDev",
        outcome: "Error",
        error: err,
        errorStack: err.stack
    })

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
}


/**
 * function: sendErrorProd
 * @param err - error object
 * @param req - request object
 * @param res - response object
 * @description: This function sends the error in production mode
 */
const sendErrorProd = (err, req, res) => {

    req.logger.error({
        userCustomId: req?.user?.customId || `New User`,
        username: req?.user?.org_username || `New User`,
        role: req?.user?.role || `New User`,
        event: "sendErrorProd",
        outcome: "Error",
        error: err
    })

    if (req.originalUrl.startsWith('/api'))
    {    // Operational, trusted error: send message to client
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
    }
    else {
        return res.status(err.statusCode).render('website/404', {
            title: errorMessages.SOMETHING_WENT_WRONG,
            msg: err.message
        });
    }
};



module.exports = (err, req, res, next) => {

    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    if (process.env.NODE_ENV === "development")
        sendErrorDev(err, req, res);

    else if (process.env.NODE_ENV === "production") {

        let error = { ...err };
        error.message = err.message;

        // @TODO: handle the errors here in production

        if (error.name === 'JsonWebTokenError') error = handleJWTError();
        if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

        sendErrorProd(error, req, res)
    }

};
