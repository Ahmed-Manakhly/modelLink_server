/**
 * @name CreateError
 * @description This class is used to handle custom errors
 * @param message
 * @param statusCode
 * @description This class is used to handle custom errors
 */
class CreateError extends Error {
    constructor(statusCode, message) {

        // call the parent constructor
        super(message);
        this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
        this.statusCode = statusCode;
        this.message = message;
        this.isOperational = true;

        // capture the stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

module.exports= CreateError;
