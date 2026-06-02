// const createError = require("../utils/createError");
// const errorMessages = require("../utils/errorMessages");
// by manakhly
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const prisma = require("../prisma/prisma");

//-------------------------------------------------------------------------------
exports.createNotification = asyncErrorCatching(async (req, res,next) => {
    let {
        actionDesc,
        to,
        from,
        actionLink
    } = req.body;
    const data = {actionDesc , to , from , actionLink , unRead: true}
    const newNotification = await prisma.Notification.create({
        data ,
    });
    if (newNotification) {
        res.status(201).json({
            status: "success",
            data: {
                newNotification
            }
        });
    } else {
        res.status(424).json({
            status: "failed",
            data: {
                "message": "can't create notification"
            }
        });
    }
});
//----------------------------------------------------------------------------------
exports.getAllNotificationByUser = asyncErrorCatching(async (req, res) => {
    const userId = req.params.id
    const notifications = await prisma.Notification.findMany({
        orderBy: {
            createdAt : 'desc'
        },
        where: {
            to : userId,
        },
    });
    res.status(200)
        .json({
            status: "success",
            message: "notifications retrieved!",
            data: notifications
        });
});
//-----------------------------------------------------------------------------------

exports.deleteNotification = asyncErrorCatching(async (req, res) => {
    const existingNotification = await prisma.Notification.findUnique({
        where: {
            id: parseInt(req.params.id, 10)
        },
    });
    if (!existingNotification) {
        throw new Error('notification not found');
    }
    await prisma.Notification.delete({
        where: {
            id: parseInt(req.params.id, 10)
        },
    });

        res.status(204).json({
            status: "success",
            data: null
        });
});
//-----------------------------------------------------------------------------------
exports.updateNotification = asyncErrorCatching(async (req, res) => {
    const id = +req.params.id

    const existingNotification = await prisma.Notification.findUnique({
        where: {
            id,
        },
    });

    if (!existingNotification) {
        throw new Error('notification not found!');
    }

    const updatedNotification = await prisma.Notification.update({
        where: {
            id,
        },
        data: {
            ...req.body,
        },
    });
    res.status(200).json({
        status: 'success',
        message: 'notification updated successfully!',
        data: updatedNotification,
    });
});