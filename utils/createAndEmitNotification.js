const prisma = require('../prisma/prisma');
const { orderLinkForRole } = require('./notificationLinks');

const VALID_NOTIFICATION_TYPES = ['ORDER', 'REVIEW', 'MODEL', 'SYSTEM', 'MESSAGE'];

function normalizeNotificationData(data) {
    return {
        ...data,
        type: VALID_NOTIFICATION_TYPES.includes(data.type) ? data.type : 'SYSTEM',
        unRead: data.unRead !== false,
    };
}

function emitNotification(io, notification) {
    if (!io || !notification?.recipientId) return;

    const payload = {
        ...notification,
        actionLink: notification.actionLink || null,
        unRead: true,
    };

    io.to(`${notification.recipientId}__room`).emit('receive_order', payload);
    io.to(`${notification.recipientId}__room`).emit('refresh', payload);

    if (notification.senderId && notification.senderId !== notification.recipientId) {
        io.to(`${notification.senderId}__room`).emit('refresh', payload);
    }
}

async function createNotificationRecord(data, client = prisma) {
    return client.notification.create({ data: normalizeNotificationData(data) });
}

async function createAndEmitNotification(data, io, client = prisma) {
    const notification = await createNotificationRecord(data, client);
    emitNotification(io, notification);
    return notification;
}

/** Notify order client and developer (e.g. dispute resolution, admin refund). */
async function notifyOrderClientAndDeveloper(io, { senderId, order, clientMessage, developerMessage }) {
    if (!io || !order?.clientId || !order?.developerId) return;

    await createAndEmitNotification({
        actionDesc: clientMessage,
        type: 'ORDER',
        recipientId: order.clientId,
        senderId: senderId || null,
        actionLink: orderLinkForRole('CLIENT', order.id),
        unRead: true,
    }, io);

    await createAndEmitNotification({
        actionDesc: developerMessage,
        type: 'ORDER',
        recipientId: order.developerId,
        senderId: senderId || null,
        actionLink: orderLinkForRole('DEVELOPER', order.id),
        unRead: true,
    }, io);
}

module.exports = {
    createAndEmitNotification,
    createNotificationRecord,
    emitNotification,
    notifyOrderClientAndDeveloper,
};
