const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const prisma = require("../prisma/prisma");
const { isComplexPassword, isPasswordExpired, isValidEmail } = require('../utils/passwordEmailChecker');
const { UserRole } = require('@prisma/client');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const util = require('util');
const sendEmail = require('../utils/email');
const { buildOtpEmailHtml } = require('../utils/emailTemplates');
const bcrypt = require('bcrypt');
const { uploadingFiles } = require('../utils/fileUploader');
const { getFiles, parseJSONField } = require('../utils/helpers');
const { generateOptions, safeUserFields, publicUserFields } = require('../utils/ApiFeaturesHelpersForUsers');
const ApiFeatures = require('../utils/ApiFeatures');
const { normalizeFilterQuery, FILTER_SPECS, parseMultiValueFilter } = require('../utils/normalizeFilterQuery');
const errorMessages = require("../utils/errorMessages");
const createCustomIds = require("../utils/createCustomIds");

const STAFF_ROLES = [UserRole.ADMIN, UserRole.EMPLOYEE];
const MARKETPLACE_ROLES = [UserRole.CLIENT, UserRole.DEVELOPER];

const getAuthCookieOptions = (expires) => ({
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
});

//============================================================================ helpers
const signToken = (payload, secret, expiresIn) => jwt.sign(payload, secret, { expiresIn });

const createSendToken = (user, statusCode, res) => {
    const accessTokenExpiresIn = parseInt(process.env.ACCESS_TOKEN_EXPIRATION, 10) / 1000;
    const token = signToken(
        { id: user.id, org_username: user.org_username, role: user.role },
        process.env.ACCESS_SECRET_STR,
        accessTokenExpiresIn
    );

    // Set JWT token in cookie
    const cookieOptions = getAuthCookieOptions(
        new Date(Date.now() + parseInt(process.env.ACCESS_TOKEN_EXPIRATION, 10))
    );
    res.cookie('jwt', token, cookieOptions);

    const safeUser = {};
    Object.keys(safeUserFields).forEach(key => {
        if (user[key] !== undefined) {
            safeUser[key] = user[key];
        }
    });

    logger.info('Token sent successfully', {
        userCustomId: user.customId,
        username: user.org_username,
        role: user.role,
        event: 'createSendToken',
    });

    res.status(statusCode).json({
        status: 'success',
        token,
        data: { user: safeUser },
    });
};

const sendSuccessMessage = (res, statusCode, message) => {
    res.status(statusCode).json({ status: 'success', message });
};

const getOtpExpirationMinutes = () => {
    const minutes = parseInt(process.env.OTP_EXPIRATION, 10);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : 5;
};

const isStaffRole = (role) => STAFF_ROLES.includes(role);

//============================================================================ middleware
exports.protect = asyncErrorCatching(async (req, res, next) => {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.query.token) {
        token = req.query.token;
    }

    if (!token || token === 'null' || token === 'undefined') {
        return next(new createError(401, errorMessages.NOT_LOGGED_IN));
    }

    try {
        const decoded = await util.promisify(jwt.verify)(token, process.env.ACCESS_SECRET_STR);
        const user = await prisma.user.findUnique({ where: { id: decoded.id } });

        if (!user) {
            return next(new createError(401, errorMessages.USER_BELONGS_TO_TOKEN_NOT_FOUND));
        }

        if (user.deletedAt) {
            return next(new createError(401, errorMessages.USER_DELETED));
        }

        if (user.lockup) {
            const lockoutPeriod = 15 * 60 * 1000; // 15 minutes
            if (Date.now() - new Date(user.lockup).getTime() <= lockoutPeriod) {
                return next(new createError(401, errorMessages.ACCOUNT_LOCKED));
            } else if (!user.isActive) {
                // If the lockout period has expired but user is still inactive due to lockup, un-lock them
                await prisma.user.update({
                    where: { id: user.id },
                    data: { isActive: true, failed_attempts: 0, lockup: null }
                });
                user.isActive = true;
                user.lockup = null;
                user.failed_attempts = 0;
            }
        }

        if (!user.isActive) {
            return next(new createError(401, errorMessages.USER_INACTIVE));
        }

        if (user.password_change) {
            const passwordChangedSeconds = Math.floor(new Date(user.password_change).getTime() / 1000);
            if (decoded.iat < passwordChangedSeconds) {
                return next(new createError(401, errorMessages.PASSWORD_CHANGED_RELOGIN));
            }
        }

        if (isPasswordExpired(user)) {
            return next(new createError(401, errorMessages.PASSWORD_EXPIRED));
        }

        if (user.role !== decoded.role) {
            return next(new createError(401, errorMessages.ROLE_CHANGED_RELOGIN));
        }

        req.user = user;
        logger.info('User authenticated successfully', {
            userCustomId: user.customId,
            username: user.org_username,
            role: user.role,
            event: 'protect',
        });
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return next(new createError(401, errorMessages.SESSION_EXPIRED));
        }
        return next(new createError(401, errorMessages.AUTHENTICATION_FAILED));
    }
});

exports.restrictTo = (...roles) => {
    return asyncErrorCatching(async (req, res, next) => {
        if (!req?.user?.role) {
            return next(new createError(401, errorMessages.NOT_LOGGED_IN));
        }
        if (!roles.includes(req.user.role)) {
            return next(new createError(403, errorMessages.NOT_AUTHORIZED));
        }
        next();
    });
};

exports.uploadUserFiles = uploadingFiles('users', [
    { name: 'avatar', maxCount: 1 },
]);

// ADMIN creates another ADMIN (initial admins are seeded directly in DB)
exports.createAdmin = asyncErrorCatching(async (req, res, next) => {
    req.options = {
        forcedRole: UserRole.ADMIN,
        roleValidation: (role) => {
            if (role && role !== UserRole.ADMIN) {
                return {
                    isError: true,
                    roleError: new createError(400, errorMessages.ROLE_ASSIGNMENT_NOT_ALLOWED),
                };
            }
            return { isError: false, roleError: null };
        },
        requireEmailValidation: () => true,
        requirePasswordValidation: () => true,
        sendToken: false,
    };
    next();
});

// ADMIN creates internal EMPLOYEE accounts (not marketplace DEVELOPER freelancers)
exports.createEmployee = asyncErrorCatching(async (req, res, next) => {
    req.options = {
        forcedRole: UserRole.EMPLOYEE,
        roleValidation: (role) => {
            if (role && role !== UserRole.EMPLOYEE) {
                return {
                    isError: true,
                    roleError: new createError(400, errorMessages.ROLE_ASSIGNMENT_NOT_ALLOWED),
                };
            }
            return { isError: false, roleError: null };
        },
        requireEmailValidation: () => true,
        requirePasswordValidation: () => true,
        sendToken: false,
    };
    next();
});

//============================================================================ public auth (CLIENT / DEVELOPER register + login)
exports.register = asyncErrorCatching(async (req, res, next) => {
    const { email, org_username, org_name, password, passwordConfirm, role } = req.body;
    const normalizedRole = role?.toUpperCase();

    if (normalizedRole === 'ADMIN') {
        return next(new createError(400, errorMessages.ADMIN_ROLE_NOT_ALLOWED));
    }
    if (normalizedRole === 'EMPLOYEE') {
        return next(new createError(400, errorMessages.INTERNAL_ROLE_NOT_ALLOWED));
    }

    if (!password || !org_username || !email || !passwordConfirm) {
        return next(new createError(400, errorMessages.EMAIL_USERNAME_PASSWORD_REQUIRED));
    }

    const normalizedUsername = org_username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
        return next(new createError(400, errorMessages.INVALID_EMAIL_FORMAT));
    }

    if (password !== passwordConfirm) {
        return next(new createError(400, errorMessages.PASSWORDS_DO_NOT_MATCH));
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [
                { org_username: normalizedUsername },
                { email: normalizedEmail }
            ],
        },
    });

    if (existingUser?.id) {
        return next(new createError(400, errorMessages.USER_ALREADY_EXISTS));
    }

    if (!isComplexPassword(password)) {
        return next(new createError(400, errorMessages.INVALID_PASSWORD));
    }

    const assignedRole = MARKETPLACE_ROLES.includes(normalizedRole)
        ? normalizedRole
        : UserRole.CLIENT;

    const {
        first_name,
        last_name,
        country,
        org_phone,
        org_desc,
        logoURl,
    } = req.body;

    const hashedPassword = await bcrypt.hash(password, 12);
    const customId = createCustomIds(assignedRole);
    const avatar = getFiles(req.files, 'avatar')?.[0] || logoURl || null;

    const createData = {
        customId,
        org_username: normalizedUsername,
        email: normalizedEmail,
        password: hashedPassword,
        first_name: first_name || '',
        last_name: last_name || '',
        country: country || '',
        org_phone: org_phone || 'N/A',
        org_name: org_name || org_username,
        org_desc: org_desc || '',
        role: assignedRole,
        avatar,
    };

    if (assignedRole === 'DEVELOPER') {
        createData.wallet = { create: { availableBalance: 0, pendingBalance: 0, totalEarnings: 0 } };
    }

    try {
        const newUser = await prisma.user.create({
            data: createData,
        });

        logger.info('User registered successfully', {
            userCustomId: newUser.customId,
            username: newUser.org_username,
            role: newUser.role,
        });

        createSendToken(newUser, 201, res);
    } catch (err) {
        if (err.code === 'P2002') {
            return next(new createError(400, errorMessages.USER_ALREADY_EXISTS));
        }
        return next(err);
    }
});

exports.login = asyncErrorCatching(async (req, res, next) => {
    const emailOrUsername = (req.body.email || req.body.org_username)?.trim().toLowerCase();
    const password = req.body.password;

    if (!emailOrUsername || !password) {
        return next(new createError(400, "email/username and password are required !"));
    }

    const user = await prisma.user.findFirst({
        where: {
            OR: [
                { email: emailOrUsername },
                { org_username: emailOrUsername }
            ]
        },
    });

    if (!user || user.deletedAt) {
        return next(new createError(401, errorMessages.INVALID_CREDENTIALS));
    }

    const lockoutPeriod = 15 * 60 * 1000; // 15 minutes
    if (user.lockup && (Date.now() - new Date(user.lockup).getTime() > lockoutPeriod)) {
        await prisma.user.update({
            where: { id: user.id },
            data: {
                isActive: true,
                failed_attempts: 0,
                lockup: null
            }
        });
        user.isActive = true;
        user.failed_attempts = 0;
        user.lockup = null;
    }

    if (!user.isActive) {
        return next(new createError(401, errorMessages.ACCOUNT_LOCKED));
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
        const failedAttempts = user.failed_attempts + 1;
        const updateData = { failed_attempts: failedAttempts };

        if (failedAttempts >= 10) {
            updateData.isActive = false;
            updateData.lockup = new Date();
        }

        await prisma.user.update({
            where: { id: user.id },
            data: updateData,
        });

        if (failedAttempts >= 10) {
            return next(new createError(401, errorMessages.ACCOUNT_LOCKED));
        }

        return next(new createError(401, errorMessages.INVALID_CREDENTIALS));
    }

    if (isPasswordExpired(user)) {
        return next(new createError(401, errorMessages.PASSWORD_EXPIRED));
    }

    await prisma.user.update({
        where: { id: user.id },
        data: { failed_attempts: 0, lastLogin: new Date() },
    });

    logger.info('User logged in successfully', {
        userCustomId: user.customId,
        username: user.org_username,
        role: user.role,
    });

    createSendToken(user, 200, res);
});

exports.createEmailToken = asyncErrorCatching(async (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        logger.error('Email token creation failed', { error: 'Please provide your email!' });
        return next(new createError(400, errorMessages.EMAIL_REQUIRED));
    }

    const normalizedEmail = email.toLowerCase();
    const existingToken = await prisma.emailToken.findUnique({ where: { email: normalizedEmail } });

    if (existingToken && new Date(existingToken.expiresAt) > new Date()) {
        logger.error('Email token creation failed', { error: 'OTP already sent, please wait before requesting again!' });
        return next(new createError(429, errorMessages.OTP_ALREADY_SENT));
    }

    const otp = `${Math.floor(1000 + Math.random() * 9000)}`;
    const hashedOtp = await bcrypt.hash(otp, 10);
    const expiration = new Date();
    const otpMinutes = getOtpExpirationMinutes();
    expiration.setMinutes(expiration.getMinutes() + otpMinutes);

    await prisma.emailToken.upsert({
        where: { email: normalizedEmail },
        update: {
            emailToken: hashedOtp,
            expiresAt: expiration,
            createdAt: new Date(),
        },
        create: {
            email: normalizedEmail,
            emailToken: hashedOtp,
            expiresAt: expiration,
            createdAt: new Date(),
        },
    });

    try {
        await sendEmail({
            email: normalizedEmail,
            subject: 'Verify Your Email — ModelLink',
            emailTemplate: buildOtpEmailHtml({ otp, expiresMinutes: otpMinutes }),
            message: `Your ModelLink verification code is ${otp}. It expires in ${otpMinutes} minutes.`,
        });
        logger.info('Email token creation successful', { email: normalizedEmail });
        res.status(201).json({
            status: 'success',
            data: {
                message: 'verification OTP mail sent successfully',
                email: normalizedEmail,
            },
        });
    } catch (err) {
        logger.error('Email token creation failed', { error: err.message, email: normalizedEmail });
        return next(new createError(500, errorMessages.EMAIL_SEND_FAILED));
    }
});

exports.resetPassword = asyncErrorCatching(async (req, res, next) => {
    const { email, password, passwordConfirm, otp } = req.body;

    if (!email || !password || !passwordConfirm || !otp) {
        logger.error('Password reset failed', { error: 'Please provide your email, password, and OTP!' });
        return next(new createError(400, errorMessages.OTP_FIELDS_REQUIRED));
    }

    const normalizedEmail = email.toLowerCase();
    const exToken = await prisma.emailToken.findFirst({ where: { email: normalizedEmail } });

    if (!exToken) {
        logger.error('Password reset failed', { error: 'Email token not found!' });
        return next(new createError(400, errorMessages.EMAIL_INVALID));
    }

    if (exToken.expiresAt < Date.now()) {
        logger.error('Password reset failed', { error: 'OTP has been expired!' });
        return next(new createError(400, errorMessages.OTP_EXPIRED));
    }

    const otpIsValid = await bcrypt.compare(otp, exToken.emailToken);
    if (!otpIsValid) {
        logger.error('Password reset failed', { error: 'Invalid OTP!' });
        return next(new createError(400, errorMessages.OTP_INVALID));
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
        logger.error('Password reset failed', { error: 'User not found!' });
        return next(new createError(404, errorMessages.USER_NOT_FOUND_RETRY));
    }

    if (password !== passwordConfirm) {
        logger.error('Password reset failed', { error: 'Passwords do not match!' });
        return next(new createError(400, errorMessages.PASSWORDS_DO_NOT_MATCH));
    }

    if (!isComplexPassword(password)) {
        logger.error('Password reset failed', { error: 'Invalid password complexity!' });
        return next(new createError(400, process.env.PASSWORD_COMPLEXITY || errorMessages.INVALID_PASSWORD));
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.user.update({
        where: { email: normalizedEmail },
        data: {
            password: passwordHash,
            password_change: new Date(),
            failed_attempts: 0,
            lockup: null,
            isActive: true,
        },
    });

    await prisma.emailToken.delete({ where: { email: normalizedEmail } });
    logger.info('Password reset successfully', { email: normalizedEmail });
    sendSuccessMessage(res, 200, 'Password has been changed successfully!');
});

exports.verifyEmailToken = asyncErrorCatching(async (req, res, next) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        logger.error('verify Email Token failed', { error: 'OTP or Email is missing!' });
        return next(new createError(400, errorMessages.OTP_OR_EMAIL_MISSING));
    }

    const normalizedEmail = email.toLowerCase();
    const exToken = await prisma.emailToken.findFirst({ where: { email: normalizedEmail } });

    if (!exToken) {
        logger.error('verify Email Token failed', { error: 'Email is invalid!' });
        return next(new createError(400, errorMessages.EMAIL_INVALID));
    }

    if (exToken.expiresAt < Date.now()) {
        logger.error('verify Email Token failed', { error: 'OTP has been expired!' });
        return next(new createError(400, errorMessages.OTP_EXPIRED));
    }

    const otpIsValid = await bcrypt.compare(otp, exToken.emailToken);
    if (!otpIsValid) {
        logger.error('verify Email Token failed', { error: 'Invalid OTP!' });
        return next(new createError(400, errorMessages.OTP_INVALID));
    }

    res.status(200).json({
        status: 'success',
        data: { message: 'Email verified successfully!' },
    });
});

//============================================================================ current user (profile)
exports.getMe = asyncErrorCatching(async (req, res, next) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: safeUserFields,
    });

    if (!user) {
        return next(new createError(404, errorMessages.USER_NOT_FOUND));
    }

    res.status(200).json({
        status: 'success',
        data: { user },
    });
});

exports.changePassword = asyncErrorCatching(async (req, res, next) => {
    const { currentPassword, newPassword, newPasswordConfirm } = req.body;

    if (!currentPassword || !newPassword || !newPasswordConfirm) {
        logger.error('changePassword failed', { error: 'Current password and new password are required!' });
        return next(new createError(400, errorMessages.CURRENT_PASSWORD_AND_NEW_PASSWORD_REQUIRED));
    }

    if (newPassword !== newPasswordConfirm) {
        logger.error('changePassword failed', { error: 'Passwords do not match!' });
        return next(new createError(400, errorMessages.PASSWORDS_DO_NOT_MATCH));
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
        logger.error('changePassword failed', { error: 'User not found!' });
        return next(new createError(404, errorMessages.USER_NOT_FOUND));
    }

    if (!user.isActive) {
        logger.error('changePassword failed', { error: 'Account is locked!' });
        return next(new createError(400, errorMessages.ACCOUNT_IS_LOCKED));
    }

    const isPasswordCorrect = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordCorrect) {
        logger.error('changePassword failed', { error: 'Invalid credentials!' });
        return next(new createError(401, errorMessages.INVALID_CREDENTIALS));
    }

    if (!isComplexPassword(newPassword)) {
        logger.error('changePassword failed', { error: 'Invalid password complexity!' });
        return next(new createError(400, errorMessages.INVALID_PASSWORD));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
        where: { id: req.user.id },
        data: {
            password: hashedPassword,
            password_change: new Date(Date.now())
        },
    });

    logger.info('Password changed successfully', { userId: req.user.id });
    sendSuccessMessage(res, 200, 'password changed successfully');
});

exports.updateMe = asyncErrorCatching(async (req, res, next) => {
    const id = req.user?.id;

    if (!id) {
        return next(new createError(404, errorMessages.USER_NOT_FOUND));
    }

    if (!req.user.isActive) {
        return next(new createError(400, errorMessages.ACCOUNT_IS_LOCKED));
    }

    const data = parseJSONField(req.body.data);
    const avatar = getFiles(req.files, 'avatar')?.[0] || null;

    if (!data && !avatar) {
        return next(new createError(400, errorMessages.PROFILE_DATA_REQUIRED));
    }

    if (data?.role || data?.isActive || data?.email || data?.password || data?.passwordConfirm || data?.newPassword) {
        return next(new createError(400, errorMessages.CANNOT_UPDATE_RESTRICTED_FIELDS));
    }

    const updatedData = {
        first_name: data?.first_name ?? req.user.first_name,
        last_name: data?.last_name ?? req.user.last_name,
        org_name: data?.org_name ?? req.user.org_name,
        org_phone: data?.org_phone ?? req.user.org_phone,
        country: data?.country ?? req.user.country,
        org_desc: data?.org_desc ?? req.user.org_desc,
        logoUrl: data?.logoUrl ?? req.user.logoUrl,
        avatar: avatar ?? req.user.avatar,
        updatedAt: new Date(),
    };

    const updatedUser = await prisma.user.update({
        where: { id },
        data: updatedData,
        select: safeUserFields,
    });

    res.status(200).json({
        status: 'success',
        message: 'Your profile has been updated successfully!',
        data: { updatedUser },
    });
});

const loadPublicUserProfile = async (id, viewerId = null) => {
    const user = await prisma.user.findUnique({
        where: { id },
        select: {
            ...publicUserFields,
            verification: {
                select: { status: true, verifiedAt: true },
            },
        },
    });

    if (!user) {
        return null;
    }

    if (STAFF_ROLES.includes(user.role) && user.id !== viewerId) {
        throw new createError(403, "Marketplace staff profiles are private.");
    }

    return user;
};

// Guest-accessible public profile (no auth)
exports.getUserPublicProfilePublic = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
        return next(new createError(400, errorMessages.USER_ID_REQUIRED));
    }

    try {
        const user = await loadPublicUserProfile(id, null);

        if (!user) {
            return next(new createError(404, errorMessages.USER_NOT_FOUND));
        }

        res.status(200).json({ status: 'success', data: { user } });
    } catch (err) {
        next(err);
    }
});

// Guest-accessible list of public developers
exports.getPublicDevelopers = asyncErrorCatching(async (req, res, next) => {
    // Only allow fetching developers
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.user);
    filterQuery.role = 'DEVELOPER';
    filterQuery.isActive = 'true';

    const queryBuilder = new ApiFeatures(prisma.user, filterQuery, generateOptions(), null, publicUserFields);
    const { data: users, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: 'success',
        pagination,
        data: { users },
    });
});

// For chat/reviews: logged-in users can fetch another user's public profile
exports.getUserPublicProfile = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
        return next(new createError(400, errorMessages.USER_ID_REQUIRED));
    }

    try {
        const user = await loadPublicUserProfile(id, req.user.id);

        if (!user) {
            return next(new createError(404, errorMessages.USER_NOT_FOUND));
        }

        res.status(200).json({ status: 'success', data: { user } });
    } catch (err) {
        next(err);
    }
});

//============================================================================ admin handlers
exports.createUserHandler = asyncErrorCatching(async (req, res, next) => {
    const {
        roleValidation,
        requireEmailValidation,
        requirePasswordValidation,
        sendToken,
        forcedRole,
    } = req.options;

    const body = parseJSONField(req.body.data) || {};
    const {
        org_username,
        email,
        password,
        passwordConfirm,
        first_name,
        last_name,
        org_phone,
        org_name,
        org_desc,
        country,
        role: requestedRole,
    } = body;

    const role = forcedRole || requestedRole;

    if (!org_username || !email || !password || !passwordConfirm) {
        return next(new createError(400, errorMessages.EMAIL_USERNAME_PASSWORD_REQUIRED));
    }

    const normalizedUsername = org_username.trim().toLowerCase();
    const normalizedEmail = email.trim().toLowerCase();

    if (password !== passwordConfirm) {
        return next(new createError(400, errorMessages.PASSWORDS_DO_NOT_MATCH));
    }

    const existingUser = await prisma.user.findFirst({
        where: {
            OR: [{ email: normalizedEmail }, { org_username: normalizedUsername }],
        },
        select: { id: true, email: true, org_username: true },
    });

    if (existingUser) {
        if (existingUser.email === normalizedEmail) {
            return next(new createError(400, errorMessages.USER_ALREADY_EXISTS));
        }
        return next(new createError(400, 'Username is already taken'));
    }

    const { isError, roleError } = roleValidation(role);
    if (isError) {
        return next(roleError);
    }

    if (requireEmailValidation(role) && !isValidEmail(normalizedEmail)) {
        return next(new createError(400, errorMessages.INVALID_EMAIL_FORMAT));
    }

    if (requirePasswordValidation(role) && !isComplexPassword(password)) {
        return next(new createError(400, process.env.PASSWORD_COMPLEXITY || errorMessages.INVALID_PASSWORD));
    }

    const avatar = getFiles(req.files, 'avatar')?.[0] || null;
    const passwordHash = await bcrypt.hash(password, 12);
    const customId = createCustomIds(role);

    const createData = {
        customId,
        org_username: normalizedUsername,
        email: normalizedEmail,
        password: passwordHash,
        first_name: first_name || '',
        last_name: last_name || '',
        org_phone: org_phone || 'N/A',
        org_name: org_name || org_username,
        org_desc: org_desc || '',
        country: country || '',
        role,
        avatar,
    };

    if (role === 'DEVELOPER') {
        createData.wallet = { create: { availableBalance: 0, pendingBalance: 0, totalEarnings: 0 } };
    }

    try {
        const user = await prisma.user.create({
            data: createData,
        });

        if (req.user && req.user.id) {
            await prisma.auditLog.create({
                data: {
                    actionType: 'CREATE_USER',
                    targetId: user.id,
                    reason: `Admin created user with role ${user.role}`,
                    adminId: req.user.id
                }
            });
        }

        logger.info('Staff user created successfully', {
            userId: user.id,
            email: user.email,
            role: user.role,
        });

        if (sendToken) {
            createSendToken(user, 201, res);
            return;
        }

        res.status(201).json({ status: 'success', message: 'User created successfully!' });
    } catch (err) {
        if (err.code === 'P2002') {
            return next(new createError(400, errorMessages.USER_ALREADY_EXISTS));
        }
        return next(err);
    }
});

exports.getAllUsers = asyncErrorCatching(async (req, res, next) => {

    const adminUserSelect = {
        ...safeUserFields,
        wallet: { select: { availableBalance: true } },
    };

    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.user);
    parseMultiValueFilter(filterQuery, 'isActive', 'boolean');
    parseMultiValueFilter(filterQuery, 'isVerified', 'boolean');
    parseMultiValueFilter(filterQuery, 'role', 'enum');

    const queryBuilder = new ApiFeatures(prisma.user, filterQuery, generateOptions(), null, adminUserSelect);
    const { data: users, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get all users', { error: error.message, requestId: req.id });
        return next(new createError(400, error));
    }

    logger.info('Get all users successfully', { count: users.length, requestId: req.id });
    res.status(200).json({
        status: 'success',
        pagination,
        data: { users },
    });
});

exports.getUserById = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
        logger.error('Failed to get user by ID', { error: 'User ID is required!', requestId: req.id });
        return next(new createError(400, errorMessages.USER_ID_REQUIRED));
    }

    const user = await prisma.user.findUnique({
        where: { id },
        select: safeUserFields,
    });

    if (!user) {
        logger.error('Failed to get user by ID', { error: 'User not found!', requestId: req.id });
        return next(new createError(404, errorMessages.USER_NOT_FOUND));
    }

    logger.info('Get user by ID successfully', { userId: user.id, requestId: req.id });
    res.status(200).json({ status: 'success', data: { user } });
});

exports.updateUser = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
        logger.error('Failed to update user', { error: 'User ID is required!', requestId: req.id });
        return next(new createError(400, errorMessages.USER_ID_REQUIRED));
    }

    const exUser = await prisma.user.findUnique({ where: { id } });
    if (!exUser) {
        logger.error('Failed to update user', { error: 'User not found!', requestId: req.id });
        return next(new createError(404, errorMessages.USER_NOT_FOUND));
    }

    if (exUser.role === UserRole.ADMIN && req.user.role !== UserRole.ADMIN) {
        logger.error('Failed to update user', { error: 'Cannot update admin user!', requestId: req.id });
        return next(new createError(403, "You do not have permission to modify an Admin user."));
    }

    const data = parseJSONField(req.body.data);
    const avatar = getFiles(req.files, 'avatar')?.[0] || null;

    if (!data && !avatar) {
        logger.error('Failed to update user', { error: 'Profile data required!', requestId: req.id });
        return next(new createError(400, errorMessages.PROFILE_DATA_REQUIRED));
    }

    if (data?.email) {
        logger.error('Failed to update user', { error: 'Cannot update email!', requestId: req.id });
        return next(new createError(400, errorMessages.CANNOT_UPDATE_EMAIL));
    }

    if (req.user.id === id && data?.role) {
        return next(new createError(400, "You cannot modify your own role."));
    }

    let normalizedUsername = undefined;
    if (data?.org_username !== undefined) {
        normalizedUsername = data.org_username?.trim().toLowerCase();

        if (!normalizedUsername || !/^[a-zA-Z0-9_-]+$/.test(normalizedUsername)) {
            return next(new createError(400, "Username must be alphanumeric and cannot contain spaces or special characters except _ and -"));
        }

        const duplicateUsername = await prisma.user.findFirst({
            where: {
                org_username: normalizedUsername,
                id: { not: id }
            }
        });
        if (duplicateUsername) {
            return next(new createError(400, "Username is already taken by another user"));
        }
    }

    if (data?.password) {
        logger.error('Failed to update user', { error: 'Cannot update password fields!', requestId: req.id });
        return next(new createError(400, errorMessages.CANNOT_UPDATE_PASSWORD_FIELDS));
    }

    if (data?.role && isStaffRole(data.role) && req.user.role !== UserRole.ADMIN) {
        return next(new createError(400, errorMessages.CANNOT_ASSIGN_STAFF_ROLE));
    }

    if (data?.role && MARKETPLACE_ROLES.includes(exUser.role) && req.user.role !== UserRole.ADMIN) {
        return next(new createError(400, errorMessages.CANNOT_UPDATE_USER_ROLE));
    }

    if (data?.newPassword && !data?.passwordConfirm) {
        return next(new createError(400, errorMessages.PASSWORD_CONFIRMATION_REQUIRED));
    }

    if (data?.newPassword && data.newPassword !== data.passwordConfirm) {
        return next(new createError(400, errorMessages.PASSWORDS_DO_NOT_MATCH));
    }

    if (
        data?.newPassword
        && exUser.role !== UserRole.CLIENT
        && !isComplexPassword(data.newPassword)
    ) {
        return next(new createError(400, process.env.PASSWORD_COMPLEXITY || errorMessages.INVALID_PASSWORD));
    }

    const passwordHash = data?.newPassword ? await bcrypt.hash(data.newPassword, 12) : null;
    const targetRole = data?.role && req.user.role === UserRole.ADMIN ? data.role : exUser.role;

    if (targetRole === 'DEVELOPER' && exUser.role !== 'DEVELOPER') {
        const wallet = await prisma.wallet.findUnique({ where: { userId: id } });
        if (!wallet) {
            await prisma.wallet.create({
                data: {
                    userId: id,
                    availableBalance: 0,
                    pendingBalance: 0,
                    totalEarnings: 0
                }
            });
        }

    }

    if (req.user && req.user.id) {
        await prisma.auditLog.create({
            data: {
                actionType: 'UPDATE_USER',
                targetId: id,
                reason: `Admin updated user. Modified fields: ${Object.keys(data || {}).join(', ')}`,
                adminId: req.user.id
            }
        });
    }

    const updatedUser = await prisma.user.update({
        where: { id },
        data: {
            first_name: data?.first_name ?? exUser.first_name,
            last_name: data?.last_name ?? exUser.last_name,
            org_name: data?.org_name ?? exUser.org_name,
            org_username: normalizedUsername ?? exUser.org_username,
            org_phone: data?.org_phone ?? exUser.org_phone,
            country: data?.country ?? exUser.country,
            org_desc: data?.org_desc ?? exUser.org_desc,
            avatar: avatar ?? exUser.avatar,
            isActive: data?.isActive !== undefined ? data.isActive : exUser.isActive,
            password: passwordHash ?? exUser.password,
            password_change: passwordHash ? new Date() : exUser.password_change,
            role: targetRole,
        },
        select: safeUserFields
    });

    res.status(200).json({
        status: 'success',
        message: 'User has been updated successfully!',
        data: { updatedUser }
    });
});

exports.deleteUser = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
        logger.error('Failed to delete user', { error: 'User ID is required!', requestId: req.id });
        return next(new createError(400, errorMessages.USER_ID_REQUIRED));
    }

    const exUser = await prisma.user.findUnique({ where: { id } });
    if (!exUser) {
        logger.error('Failed to delete user', { error: 'User not found!', requestId: req.id });
        return next(new createError(404, errorMessages.USER_NOT_FOUND));
    }

    if (exUser.role === UserRole.ADMIN) {
        logger.error('Failed to delete user', { error: 'Cannot delete admin user!', requestId: req.id });
        return next(new createError(403, "You do not have permission to delete an Admin user."));
    }

    // Soft delete the user by setting deletedAt and isActive = false
    await prisma.user.update({
        where: { id },
        data: {
            deletedAt: new Date(),
            isActive: false
        }
    });

    // Hide all conversations where the deleted user was a participant
    await prisma.conversationParticipant.updateMany({
        where: { userId: id },
        data: { isHidden: true }
    });

    if (req.user && req.user.id) {
        await prisma.auditLog.create({
            data: {
                actionType: 'DELETE_USER',
                targetId: id,
                reason: `Admin soft-deleted user`,
                adminId: req.user.id
            }
        });
    }

    logger.info('User soft-deleted successfully', {
        userId: id,
        adminId: req.user.id,
        event: 'deleteUser',
        outcome: 'Success'
    });

    res.status(200).json({
        status: 'success',
        message: 'User has been soft-deleted successfully!'
    });
});

exports.logout = asyncErrorCatching(async (req, res, next) => {
    res.cookie('jwt', 'loggedout', getAuthCookieOptions(new Date(Date.now() + 10 * 1000)));
    res.status(200).json({ status: 'success' });
});
