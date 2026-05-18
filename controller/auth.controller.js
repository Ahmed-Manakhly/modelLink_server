const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken")
// const User = require("../models/user.model");
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const {isComplexPassword, isPasswordExpired} = require("../utils/passwordChecker");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const createCustomIds = require("../utils/createCustomIds");





/**
 * @name register
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function registers a new user and sends a jwt token
 * @type {(function(*, *, *): void)|*}
 */
exports.register = asyncErrorCatching(async (req, res, next) => {

    let {email, org_username, org_name, password, passwordConfirm} = req.body

    // Check if the role sent in the request is 'admin'
    if (req.body.role && req.body.role.toLowerCase() === 'admin')
        return next(new createError(400, errorMessages.ADMIN_ROLE_NOT_ALLOWED));

    if (!password || !org_username || !email || !passwordConfirm)
        return next(new createError(400, errorMessages.EMAIL_USERNAME_PASSWORD_REQUIRED));

    if (password !== passwordConfirm)
        return next(new createError(400, errorMessages.PASSWORDS_DO_NOT_MATCH));


    const user = await prisma.user.findFirst({
        where: {
            OR: [
                {org_username},
                {email},
                {org_name}
            ],
        }
    });

    if (user && user.id) return next(new createError(400, errorMessages.USER_ALREADY_EXISTS));

    // check if the password is complex enough for HIPAA compliance
    if (!isComplexPassword(password))
        return next(new createError(400, errorMessages.INVALID_PASSWORD));

    const hashedPassword = bcrypt.hashSync(password, 12);

    const {
        first_name,
        last_name,
        country,
        org_phone,
        org_desc,
        role,
        logoURl,
        org_aet,
        org_ipAddress,
        rule_id,
        target_id,
        module_id

    } = req.body

    const customId = createCustomIds(role);

    const newUser = await prisma.user.create({
        data: {
            customId,
            org_username,
            email,
            password: hashedPassword,
            first_name,
            last_name,
            country,
            org_phone,
            org_name,
            org_desc,
            role,
            logoURl,
            org_aet,
            org_ipAddress,
            rule_id,
            target_id,
            module_id
        }
    });

    req.logger.info({
        userCustomId: newUser.customId,
        username: newUser.org_username,
        role: newUser.role,
        event: "register",
        outcome: "Success",
    }, "User created successfully");

    createSendToken(newUser, 201, req, res);
});


/**
 * @name login
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function logs in a user and sends a jwt token
 * @type {(function(*, *, *): void)|*}
 */
exports.login = asyncErrorCatching(async (req, res, next) => {

    const org_username = req.body.org_username.trim();
    const password = req.body.password;

    // check if org_username and password exist in the request
    if (!org_username || !password)
        return next(new createError(400, errorMessages.USERNAME_AND_PASSWORD_REQUIRED));

    // check if user exists
    // const user = await User.findOne({org_username: org_username}).select("+password");

    const user = await prisma.user.findUnique({
        where: {
            org_username: org_username
        },
    });

    if (!user || !bcrypt.compareSync(password, user.password)) {

        // increment the number of failed login attempts if the user exists
        if (user) {

            if (user.failed_attempts >= 10) {
                return next(new createError(401, errorMessages.ACCOUNT_LOCKED));
            }

            user.failed_attempts++;

            if (user.failed_attempts === 10) {
                user.isActive = false;
                user.lockup = new Date(Date.now());
            }

            await prisma.user.update({
                where: {
                    org_username: org_username
                },
                data: {
                    failed_attempts: user.failed_attempts,
                    isActive: user.isActive,
                    lockup: user.lockup
                }
            });
        }

        return next(new createError(401, errorMessages.INVALID_CREDENTIALS));
    }

    if (!user.isActive)
        return next(new createError(401, errorMessages.ACCOUNT_IS_LOCKED));

    if (isPasswordExpired(user))
        return next(new createError(401, errorMessages.PASSWORD_EXPIRED));

    // reset the number of failed login attempts
    user.failed_attempts = 0;
    await prisma.user.update({
        where: {
            org_username: org_username
        },
        data: {
            failed_attempts: user.failed_attempts
        }
    });

    req.logger.info({
        userCustomId: user.customId,
        username: user.org_username,
        role: user.role,
        event: "login",
        outcome: "Success",
    }, "User logged in successfully");

    // create and send token
    createSendToken(user, 200, req, res);
});


/**
 * @name logout
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function logs out a user by clearing the access token cookie
 * @type {(function(*, *, *): void)|*}
 */
exports.logout = asyncErrorCatching(async (req, res, next) => {

    res.clearCookie("accessToken", {
        sameSite: "None",
        secure: true
    })

    req.logger.info({
        userid: req.user.id,
        username: req.user.org_username,
        role: req.user.role,
        event: "logout",
        outcome: "Success",
    }, "User logged out successfully");

    res
        .status(200)
        .json({
            status: "success"
        });
});


/**
 * @name getMe
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function gets the current user information if the user is logged in
 * @type {(function(*, *, *): void)|*}
 */
exports.getMe = asyncErrorCatching(async (req, res, next) => {

    let {user} = req;
    user.password = undefined;

    req.logger.info({
        userCustomId: user.customId,
        username: user.org_username,
        role: user.role,
        event: "getMe",
        outcome: "Success",
    }, "User information retrieved successfully");

    res
        .status(200)
        .json({
            status: "success",
            data: {
                user
            }
        });
});


/**
 * @name changeMyPassword
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function changes the current user's password
 * @type {(function(*, *, *): void)|*}
 */
exports.changeMyPassword = asyncErrorCatching(async (req, res, next) => {

    const {currentPassword, newPassword, newPasswordConfirm} = req.body;

    if (!currentPassword || !newPassword)
        return next(new createError(400, errorMessages.CURRENT_PASSWORD_AND_NEW_PASSWORD_REQUIRED));

    if (newPassword !== newPasswordConfirm)
        return next(new createError(400, errorMessages.PASSWORDS_DO_NOT_MATCH));

    const user = await prisma.user.findUnique({
        where: {
            id: req.user.id
        }
    });

    if (!user || !bcrypt.compareSync(currentPassword, user.password))
        return next(new createError(401, errorMessages.INVALID_CREDENTIALS));

    if (!isComplexPassword(newPassword))
        return next(new createError(400, errorMessages.INVALID_PASSWORD));

    user.password = bcrypt.hashSync(newPassword, 12);
    user.passwordLastChangedTimestamp = new Date(Date.now());

    await prisma.user.update({
        where: {
            id: req.user.id
        },
        data: {
            password: user.password,
            passwordLastChangedTimestamp: user.passwordLastChangedTimestamp
        }
    });

    res
        .status(200)
        .json({
            status: "success",
            message: "password changed successfully"
        });

});


/**
 * @name forgotPassword
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function sends a password reset token to the user's email
 * @type {(function(*, *, *): void)|*}
 */
exports.forgotPassword = asyncErrorCatching(async (req, res, next) => {
    // @TODO: request password reset token and send it to the user's email
});


/**
 * @name resetPassword
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function resets the user's password
 * @type {(function(*, *, *): void)|*}
 */
exports.resetPassword = asyncErrorCatching(async (req, res, next) => {
    // @TODO : reset the user's password & update the passwordLastChangedTimestamp
});

/**
 * @name protect
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function protects a route ensuring that only logged-in users can access it
 * @type {(function(*, *, *): void)|*}
 */
exports.protect = asyncErrorCatching(async (req, res, next) => {

    let token = null;

    // get token and check if it's there
    if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
        token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.accessToken) {
        token = req.cookies.accessToken;
    }

    // if no token, return error
    if (!token || token === "null" || token === "undefined") {
        return next(new createError(401, errorMessages.NOT_LOGGED_IN));
    }

    // verify token
    const decoded = await jwt.verify(token, process.env.JWT_SECRET);

    // check if user still exists
    const currentUser = await prisma.user.findUnique({
        where: {
            id: decoded.id
        },
    });

    if (!currentUser) {
        return next(new createError(401, errorMessages.USER_BELONGS_TO_TOKEN_NOT_FOUND));
    }

    req.logger.info({
        userCustomId: currentUser.customId,
        username: currentUser.org_username,
        role: currentUser.role,
        event: "protect",
        outcome: "Success",
    }, "User authenticated successfully");

    // grant access to protected route
    req.user = currentUser;
    next();
});


/**
 * @name restrictTo
 * @param roles
 * @returns {(function(*, *, *): (*|undefined))|*}
 * @description This function restricts access to a route based on the user's role
 * @type {(function(...[*]=): function(*, *, *): (*|undefined))|*}
 */
exports.restrictTo = (...roles) => {
    return (req, res, next) => {

        // roles is an array of ['ADMIN', 'DEVELOPER', 'CLIENT']
        if (!roles.includes(req.user.role)) {
            return next(
                new createError(403, errorMessages.NOT_AUTHORIZED)
            );
        }

        next();
    };
};


/**
 * @name signJwtToken
 * @param id
 * @param org_username
 * @param role
 * @param req
 * @returns {jwt} - signed jwt token
 * @description This function signs a jwt token
 * @type {(function(*=): *)|*}
 */
const signJwtToken = (id, org_username, role, customId, req) => {

    req.logger.info({
        userCustomId: customId,
        username: org_username,
        role: role,
        event: "signJwtToken",
        outcome: "Success",
    }, "Token signed successfully");

    return jwt.sign({id, role}, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN,
    });
};


/**
 * @name createSendToken
 * @param user
 * @param statusCode
 * @param req
 * @param res
 * @description This function creates and sends a jwt token
 * @type {(function(*, *, *): void)|*}
 */
const createSendToken = (user, statusCode, req, res) => {

    const token = signJwtToken(user.id, user.org_username, user.role, user.customId, req);

    const cookieOptions = {
        expires: new Date(Date.now() + process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60),
        httpOnly: true,
    };

    if (process.env.NODE_ENV === "production") cookieOptions.secure = true;

    res.cookie("accessToken", token, cookieOptions);

    // Remove password for security reasons
    user.password = undefined;

    req.logger.info({
        userCustomId: user.customId,
        username: user.org_username,
        role: user.role,
        event: "createSendToken",
        outcome: "Success",
    }, "Token sent successfully");

    res.status(statusCode).json({
        status: "success",
        token,
        data: {
            user
        }
    });
};



