/**
 * @name: ComplexPasswordChecker
 * @param password
 * @description This function checks if the password is complex enough for HIPAA compliance
 * @returns {boolean}
 */
// -------------------------------
const isComplexPassword = (password) => {

    // Check if the password length is at least 12 characters
    if (password.length < 12) {
        return false;
    }

    // Regular expressions for each character type
    const uppercaseRegex = /[A-Z]/;
    const lowercaseRegex = /[a-z]/;
    const digitRegex = /[0-9]/;
    const specialCharRegex = /[!@#$%^&*()_+{}|:"<>?]/;

    // Check if the password contains at least one of each character type
    if (!uppercaseRegex.test(password) ||
        !lowercaseRegex.test(password) ||
        !digitRegex.test(password) ||
        !specialCharRegex.test(password)) {
        return false;
    }

    return true;
}
// -------------------------------
const isPasswordExpired = (user) => {
    const sixMonthsInMicroseconds = 6 * 30 * 24 * 60 * 60 * 1000;
    const { password_change } = user;
    const currentTimeStamp = Date.now();

    // check if the password was changed more than 6 months ago
    return currentTimeStamp - password_change > sixMonthsInMicroseconds;
};
// -------------------------------
const isValidEmail = (email) => {
    const basicRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return basicRegex.test(email);
};
// -------------------------------
module.exports = { isComplexPassword, isPasswordExpired, isValidEmail };
