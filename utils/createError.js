/**
 * @name CreateError
 * @description This class is used to create a new error
 * @param {string} message - The error message
 * @param {number} statusCode - The status code
 * @type {function(*, *): void}
 */

class CreateError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.status = statusCode >= 400 && statusCode < 500 ? 'fail' : 'exception error';
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}


module.exports = CreateError
