const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const errorMessages = require("../utils/errorMessages");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const logger = require("../utils/logger");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS } = require("../utils/normalizeFilterQuery");
const { generateMessageOptions } = require("../utils/ApiFeaturesHelpersForMessages");
const { uploadingFiles } = require('../utils/fileUploader');
const { getFiles, parseJSONField } = require('../utils/helpers');

const emitMessagesRead = (io, senderUserId, conversationId, readByUserId) => {
    if (!io || !senderUserId) return;
    io.to(`${senderUserId}__room`).emit('messages_read', {
        conversationId,
        readByUserId,
    });
};

const markPeerMessagesRead = async (conversationId, readerUserId) => {
    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true },
    });
    if (!conversation) return null;

    const sender = conversation.participants.find((p) => p.userId !== readerUserId);

    await prisma.message.updateMany({
        where: {
            conversationId,
            userId: { not: readerUserId },
            status: { not: 'READ' },
        },
        data: { status: 'READ' },
    });

    return sender?.userId ?? null;
};

// Unified upload middleware for message attachment files
exports.uploadMessageAttachment = uploadingFiles('messages', [
    { name: 'attachment', maxCount: 1 }
]);

//-------------------------------------------------------------------------------
exports.createMessage = asyncErrorCatching(async (req, res, next) => {
    let desc, conversationId;
    const userId = req.user.id;

    // Check if data is passed via JSON or file upload
    const body = req.body.data ? parseJSONField(req.body.data) : req.body;
    const attachment = getFiles(req.files, 'attachment')?.[0] || null;

    if (attachment) {
        desc = attachment;
        conversationId = parseInt(req.query.conversationId || body.conversationId, 10);
    } else {
        desc = body.desc;
        conversationId = parseInt(body.conversationId, 10);
    }

    if (!desc || !userId || !conversationId) {
        logger.error('Failed to create message', { error: 'Missing required parameters', requestId: req.id });
        return next(new createError(400, 'Message body, user ID, and conversation ID are required.'));
    }

    const conversationFind = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { participants: true }
    });

    if (!conversationFind) {
        logger.error('Failed to create message', { error: 'Conversation not found', conversationId, requestId: req.id });
        return next(new createError(404, 'Conversation not found.'));
    }

    // Get client and developer from participants
    const participants = conversationFind.participants;
    if (participants.length < 2) {
        logger.error('Failed to create message', { error: 'Incomplete conversation participants', conversationId, requestId: req.id });
        return next(new createError(400, 'Conversation must have at least two participants.'));
    }

    const isParticipant = participants.some(p => p.userId === userId);
    if (!isParticipant) {
        return next(new createError(403, 'You are not a participant in this conversation.'));
    }

    const newMsg = await prisma.$transaction(async (tx) => {
        // Create the single message record
        const msg = await tx.message.create({
            data: {
                desc,
                userId,
                conversationId
            }
        });

        // Update conversation lastMessage & increment unReadMsg
        await tx.conversation.update({
            where: { id: conversationId },
            data: {
                lastMessage: desc,
                unReadMsg: { increment: 1 }
            }
        });

        // Update participants hasRead status
        // Set sender hasRead to true
        await tx.conversationParticipant.update({
            where: {
                conversationId_userId: {
                    conversationId,
                    userId
                }
            },
            data: { hasRead: true, isHidden: false }
        });

        // Set receiver hasRead to false
        const receiver = participants.find(p => p.userId !== userId);
        if (receiver) {
            await tx.conversationParticipant.update({
                where: {
                    conversationId_userId: {
                        conversationId,
                        userId: receiver.userId
                    }
                },
                data: { hasRead: false, isHidden: false }
            });
        }

        return msg;
    });

    logger.info({
        event: "createMessage",
        outcome: "Success",
        userId,
        conversationId
    }, "Message sent successfully");

    res.status(201).json({
        status: "success",
        data: {
            newMsg
        },
    });
});

//-------------------------------------------------------------------------------
exports.getMessages = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
        logger.error('Failed to retrieve messages', { error: 'Conversation ID is required', requestId: req.id });
        return next(new createError(400, 'Conversation ID is required.'));
    }

    const conversationId = parseInt(id, 10);

    const participant = await prisma.conversationParticipant.findUnique({
        where: {
            conversationId_userId: {
                conversationId,
                userId: req.user.id
            }
        }
    });

    if (!participant && req.user.role !== 'ADMIN') {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    if (participant && participant.hasRead === false) {
        await prisma.$transaction([
            prisma.conversation.update({
                where: { id: conversationId },
                data: { unReadMsg: 0 }
            }),
            prisma.conversationParticipant.update({
                where: {
                    conversationId_userId: {
                        conversationId,
                        userId: req.user.id
                    }
                },
                data: { hasRead: true }
            })
        ]);

        const io = req.app.get('io');
        const senderUserId = await markPeerMessagesRead(conversationId, req.user.id);
        emitMessagesRead(io, senderUserId, conversationId, req.user.id);
    }

    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.message);
    delete filterQuery.conversationId;

    const queryBuilder = new ApiFeatures(
        prisma.message,
        filterQuery,
        generateMessageOptions()
    );

    queryBuilder.query.where.AND.push({ conversationId });

    const { data: messages, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to retrieve messages', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    // The unread message count logic was migrated above the query to only reset when !hasRead.
    logger.info({
        event: "getMessages",
        outcome: "Success",
        conversationId: id,
        count: messages.length
    }, "Messages retrieved and unread counter reset");

    res.status(200).json({
        status: "success",
        pagination,
        data: {
            messages
        },
    });
});

exports.markMessagesAsRead = asyncErrorCatching(async (req, res, next) => {
    const conversationId = parseInt(req.params.conversationId, 10);

    const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId }
    });

    if (!conversation) {
        return next(new createError(404, "Conversation not found."));
    }

    // Verify user is a participant of the conversation
    const participant = await prisma.conversationParticipant.findUnique({
        where: {
            conversationId_userId: {
                conversationId,
                userId: req.user.id
            }
        }
    });

    if (!participant) {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    // Update participant's hasRead to true
    await prisma.conversationParticipant.update({
        where: {
            conversationId_userId: {
                conversationId,
                userId: req.user.id
            }
        },
        data: { hasRead: true }
    });

    const updatedConversation = await prisma.conversation.update({
        where: { id: conversationId },
        data: { unReadMsg: 0 }
    });

    const io = req.app.get('io');
    const senderUserId = await markPeerMessagesRead(conversationId, req.user.id);
    emitMessagesRead(io, senderUserId, conversationId, req.user.id);

    res.status(200).json({
        status: "success",
        message: "Messages marked as read.",
        data: { conversation: updatedConversation }
    });
});