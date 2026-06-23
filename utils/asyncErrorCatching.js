/**
 * @name asyncErrorCatching
 * @description This function is used to catch errors in async functions
 * @param fn - async function
 * @returns {(function(*, *, *): void)|*}
 */
const asyncErrorCatching = fn => {

    // return the function if no error, else catch the error and pass it to the next middleware
    return (req, res, next) => {
        fn(req, res, next).catch(next);
    };
}

module.exports = asyncErrorCatching;
