const User = require("../models/user.model");
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const filterRequestObject = require("../utils/filterRequestBody");
const APIFeatures = require("../utils/apiFeature");
const {isComplexPassword} = require("../utils/passwordChecker");
const bcrypt = require("bcrypt");
const createCustomIds = require("../utils/createCustomIds");

/****************************************** ADMIN ENDPOINTS ******************************************/

/**
 * @name createUser
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function is used to create a new user for the admin
 * @type {(function(*, *, *): void)|*}
 */
exports.createUser = asyncErrorCatching(async (req, res, next) => {

    let {email, org_username, org_name, password} = req.body;

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

    let {
        first_name,
        last_name,
        country,
        org_phone,
        org_desc,
        role,
        logoURl,
        org_aet,
        org_ipAddress,
        module_id,
        target_id,
        rule_id
    } = req.body;

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
            module_id,
            target_id,
            rule_id
        }
    });

    req.logger.info({
        userid: req.user.id,
        username: req.user.username,
        event: "createUser",
        outcome: "Success",
    }, "Admin successfully created user");

    res.status(201).json({
        status: "success",
        data: {
            newUser
        },
    });
});

/**
 * @name getAllUsers
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function is used to get all users for the admin
 * @type {(function(*, *, *): void)|*}
 */
exports.getAllUsers = asyncErrorCatching(async (req, res, next) => {

    const operation = new APIFeatures(req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();

    console.log(operation)

    const users = await prisma.user.findMany({
        where: operation.where,
        orderBy: operation.orderBy,
        select: operation.select,
        skip: operation.skip,
        take: operation.take,
    });

    req.logger.info({
        userid: req.user.id,
        username: req.user.username,
        event: "getAllUsers",
        outcome: "Success",
    }, "Admin successfully retrieved all users");

    res.status(200).json({
        status: "success",
        results: users.length,
        data: {
            users
        },
    });
});

/**
 * @name getUser
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function is used to get a single user for the admin
 * @type {(function(*, *, *): void)|*}
 */
exports.getUser = asyncErrorCatching(async (req, res, next) => {

    const {id} = req.params;

    const user = await prisma.user.findUnique({
        where: {
            id: parseInt(id)
        }
    });

    if (!user)
        return next( new createError(404, errorMessages.USER_NOT_FOUND));

    req.logger.info({
        userid: req.user.id,
        username: req.user.username,
        event: "getUser",
        outcome: "Success",
    }, "Admin successfully retrieved user");

    res.status(200).json({
        status: "success",
        data: {
            user
        },
    });
});

/**
 * @name updateUser
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function is used to update a single user for the admin
 * @type {(function(*, *, *): void)|*}
 */
exports.updateUser = asyncErrorCatching(async (req, res, next) => {

    const {id} = req.params;

    const user = await prisma.user.findUnique({
        where: {
            id: parseInt(id)
        }
    });

    if (!user)
        return next(createError(404, errorMessages.USER_NOT_FOUND));

    const updatedFields = filterRequestObject(req.body, "id", "customId", "createdAt", "updatedAt", "password");

    console.log(updatedFields)

    const updatedUser = await prisma.user.update({
        where: {
            id: parseInt(id)
        },
        data: {
            ...updatedFields
        }
    });

    req.logger.info({
        userid: req.user.id,
        username: req.user.username,
        event: "updateUser",
        outcome: "Success",
    }, "Admin successfully updated user");

    res.status(200).json({
        status: "success",
        data: {
            updatedUser
        },
    });
});

/**
 * @name deleteUser
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function is used to delete a single user for the admin
 * @type {(function(*, *, *): void)|*}
 */
exports.deleteUser = asyncErrorCatching(async (req, res, next) => {

    const {id} = req.params;

    const user = await prisma.user.findUnique({
        where: {
            id: parseInt(id)
        }
    });

    if (!user)
        return next(new createError(404, errorMessages.USER_NOT_FOUND));

    await prisma.user.delete({
        where: {
            id: parseInt(id)
        }
    });

    req.logger.info({
        userid: req.user.id,
        username: req.user.username,
        event: "deleteUser",
        outcome: "Success",
    }, "Admin successfully deleted user");

    res.status(204).json({
        status: "success",
        data: null,
    });
});

/**
 * @name unlockUserAccount
 * @param req
 * @param res
 * @param next
 * @returns {Promise<void>}
 * @description This function is used to unlock a locked user account for the admin
 * @type {(function(*, *, *): void)|*}
 */
exports.unlockUserAccount = asyncErrorCatching(async (req, res, next) => {

    const {id} = req.params;
    const user = await User.findById(id);

    if (!user) return next(createError(404, errorMessages.USER_NOT_FOUND));

    if (user.isActive)
        return next(createError(400, errorMessages.ACCOUNT_IS_ACTIVE));

    // unlock the user account and reset the number of failed login attempts
    user.isActive = true;
    user.accountLockTimestamp = null;
    user.numberOfFailedLoginAttempts = 0;
    await user.save();

    res
        .status(200)
        .json({
            status: "success",
            message: "user account unlocked successfully",
        });
});

