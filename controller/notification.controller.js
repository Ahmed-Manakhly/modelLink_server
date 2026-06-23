const createError = require("../utils/createError");
const errorMessages = require("../utils/errorMessages");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const prisma = require("../prisma/prisma");
const logger = require("../utils/logger");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS } = require("../utils/normalizeFilterQuery");
const { generateNotificationOptions } = require("../utils/ApiFeaturesHelpersForNotifications");
const { createAndEmitNotification } = require("../utils/createAndEmitNotification");

const VALID_NOTIFICATION_TYPES = ['ORDER', 'REVIEW', 'MODEL', 'SYSTEM', 'MESSAGE'];

// Realtime delivery is emitted server-side after row creation (CHAT-R1).

const ADMIN = 'ADMIN';
const EMPLOYEE = 'EMPLOYEE';

//-------------------------------------------------------------------------------
exports.createNotification = asyncErrorCatching(async (req, res, next) => {
    const { actionDesc, recipientId, actionLink, type } = req.body;
    const senderId = req.user.id;

    if (!actionDesc || !recipientId) {
        logger.error('Failed to create notification', { error: 'Missing required data', requestId: req.id });
        return next(new createError(400, 'Description and recipient are required.'));
    }

    if (recipientId === senderId) {
        return next(new createError(400, 'You cannot send a notification to yourself.'));
    }

    const recipient = await prisma.user.findUnique({ where: { id: recipientId } });
    if (!recipient) {
        logger.error('Failed to create notification', { error: 'Recipient not found', recipientId, requestId: req.id });
        return next(new createError(404, 'Recipient not found.'));
    }

    if (req.user.role === 'CLIENT' && recipient.role !== 'DEVELOPER') {
        return next(new createError(403, 'Clients may only notify developers.'));
    }

    const data = {
        actionDesc,
        recipientId,
        senderId,
        actionLink,
        unRead: true,
        type: VALID_NOTIFICATION_TYPES.includes(type) ? type : 'SYSTEM',
    };
    const newNotification = await createAndEmitNotification(data, req.app.get('io'));

    logger.info({
        event: "createNotification",
        outcome: "Success",
        notificationId: newNotification.id,
        recipientId,
    }, "Notification created successfully");

    res.status(201).json({
        status: "success",
        data: {
            newNotification
        }
    });
});

//----------------------------------------------------------------------------------
exports.getAllNotificationByUser = asyncErrorCatching(async (req, res, next) => {
    const userId = req.params.id;

    if (!userId) {
        logger.error('Failed to get notifications', { error: 'User ID is required', requestId: req.id });
        return next(new createError(400, 'User ID is required'));
    }

    if (req.user.id !== userId && req.user.role !== ADMIN && req.user.role !== EMPLOYEE) {
        logger.error('Unauthorized notifications access attempt', { userId, requesterId: req.user.id, requestId: req.id });
        return next(new createError(403, 'You are not authorized to view these notifications.'));
    }

    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.notification);
    filterQuery.recipientId = userId;

    const queryBuilder = new ApiFeatures(
        prisma.notification,
        filterQuery,
        generateNotificationOptions()
    );

    const { data: notifications, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get notifications', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    logger.info({
        event: "getAllNotificationByUser",
        outcome: "Success",
        userId,
        count: notifications.length
    }, "Notifications retrieved successfully");

    res.status(200).json({
        status: "success",
        message: "notifications retrieved!",
        pagination,
        data: notifications
    });
});

//-----------------------------------------------------------------------------------
exports.deleteNotification = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);

    if (!id) {
        logger.error('Failed to delete notification', { error: 'Notification ID is required', requestId: req.id });
        return next(new createError(400, 'Notification ID is required'));
    }

    const existingNotification = await prisma.notification.findUnique({
        where: { id },
    });

    if (!existingNotification) {
        logger.error('Failed to delete notification', { error: 'Not found', notificationId: id, requestId: req.id });
        return next(new createError(404, 'Notification not found'));
    }

    if (existingNotification.recipientId !== req.user.id && req.user.role !== ADMIN && req.user.role !== EMPLOYEE) {
        logger.error('Unauthorized notification deletion attempt', { notificationId: id, requesterId: req.user.id, requestId: req.id });
        return next(new createError(403, 'You are not authorized to delete this notification.'));
    }

    await prisma.notification.delete({
        where: { id },
    });

    logger.info({
        event: "deleteNotification",
        outcome: "Success",
        notificationId: id
    }, "Notification deleted successfully");

    res.status(204).json({
        status: "success",
        data: null
    });
});

//-----------------------------------------------------------------------------------
exports.updateNotification = asyncErrorCatching(async (req, res, next) => {
    const id = parseInt(req.params.id, 10);

    if (!id) {
        logger.error('Failed to update notification', { error: 'Notification ID is required', requestId: req.id });
        return next(new createError(400, 'Notification ID is required'));
    }

    const existingNotification = await prisma.notification.findUnique({
        where: { id },
    });

    if (!existingNotification) {
        logger.error('Failed to update notification', { error: 'Not found', notificationId: id, requestId: req.id });
        return next(new createError(404, 'Notification not found'));
    }

    if (existingNotification.recipientId !== req.user.id && req.user.role !== ADMIN && req.user.role !== EMPLOYEE) {
        logger.error('Unauthorized notification update attempt', { notificationId: id, requesterId: req.user.id, requestId: req.id });
        return next(new createError(403, 'You are not authorized to update this notification.'));
    }

    const dataToUpdate = { ...req.body };
    if (dataToUpdate.readAt === undefined && dataToUpdate.unRead === false) {
        dataToUpdate.readAt = new Date();
    }

    const updatedNotification = await prisma.notification.update({
        where: { id },
        data: dataToUpdate,
    });

    logger.info({
        event: "updateNotification",
        outcome: "Success",
        notificationId: id
    }, "Notification updated successfully");

    res.status(200).json({
        status: 'success',
        message: 'notification updated successfully!',
        data: updatedNotification,
    });
});

exports.readAllNotifications = asyncErrorCatching(async (req, res, next) => {
    const userId = req.user.id;

    await prisma.notification.updateMany({
        where: { recipientId: userId, unRead: true },
        data: {
            unRead: false,
            readAt: new Date()
        }
    });

    logger.info({
        event: "readAllNotifications",
        outcome: "Success",
        userId
    }, "All notifications marked as read for user");

    res.status(200).json({
        status: "success",
        message: "All notifications marked as read."
    });
});
