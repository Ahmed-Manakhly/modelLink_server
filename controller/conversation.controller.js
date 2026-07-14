const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const errorMessages = require("../utils/errorMessages");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const logger = require("../utils/logger");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS } = require("../utils/normalizeFilterQuery");
const { generateConversationOptions } = require("../utils/ApiFeaturesHelpersForConversations");

const participantUserSelect = {
    id: true,
    org_username: true,
    avatar: true,
    first_name: true,
    role: true,
    isActive: true,
    deletedAt: true,
};

const conversationParticipantsInclude = {
    participants: {
        include: {
            user: { select: participantUserSelect },
        },
    },
};

function buildPairKey(idA, idB) {
    return [idA, idB].sort().join('_');
}

async function findConversationByParticipantPair(idA, idB) {
    const candidates = await prisma.conversation.findMany({
        where: {
            deletedAt: null,
            AND: [
                { participants: { some: { userId: idA } } },
                { participants: { some: { userId: idB } } },
            ],
        },
        include: conversationParticipantsInclude,
    });

    return candidates.find((conversation) => {
        const participantIds = conversation.participants.map((p) => p.userId).sort();
        const expected = [idA, idB].sort();
        return participantIds.length === 2
            && participantIds[0] === expected[0]
            && participantIds[1] === expected[1];
    }) || null;
}

async function findOrCreateConversation(idA, idB) {
    const pairKey = buildPairKey(idA, idB);

    let conversation = await prisma.conversation.findUnique({
        where: { pairKey },
        include: conversationParticipantsInclude,
    });

    if (!conversation) {
        conversation = await findConversationByParticipantPair(idA, idB);
        if (conversation && !conversation.pairKey) {
            conversation = await prisma.conversation.update({
                where: { id: conversation.id },
                data: { pairKey },
                include: conversationParticipantsInclude,
            });
        }
    }

    if (!conversation) {
        conversation = await prisma.conversation.create({
            data: {
                pairKey,
                lastMessage: '',
                unReadMsg: 0,
                participants: {
                    create: [
                        { userId: idA, hasRead: true },
                        { userId: idB, hasRead: true },
                    ],
                },
            },
            include: conversationParticipantsInclude,
        });
    }

    return conversation;
}

function dedupeChatsByPairKey(chats) {
    const seen = new Map();

    for (const chat of chats) {
        const key = chat.pairKey
            || chat.participants?.map((p) => p.userId).sort().join('_')
            || String(chat.id);

        const existing = seen.get(key);
        if (!existing || new Date(chat.updatedAt) > new Date(existing.updatedAt)) {
            seen.set(key, chat);
        }
    }

    return Array.from(seen.values());
}

//-------------------------------------------------------------------------------
const createConversation = asyncErrorCatching(async (req, res, next) => {
    const { developerId, clientId, staffId } = req.body;

    let idA;
    let idB;

    if (staffId) {
        const counterpartyId = clientId || developerId;
        if (!counterpartyId) {
            return next(new createError(400, 'staffId requires clientId or developerId for the counterparty.'));
        }
        idA = staffId;
        idB = counterpartyId;

        if (req.user.id !== staffId && req.user.role !== 'ADMIN') {
            return next(new createError(403, errorMessages.NOT_AUTHORIZED));
        }
    } else {
        if (!developerId || !clientId) {
            logger.error('Failed to create conversation', { error: 'Missing client or developer ID', requestId: req.id });
            return next(new createError(400, 'Both developerId and clientId are required.'));
        }
        idA = developerId;
        idB = clientId;

        if (req.user.id !== clientId && req.user.id !== developerId && req.user.role !== 'ADMIN') {
            return next(new createError(403, errorMessages.NOT_AUTHORIZED));
        }
    }

    const users = await prisma.user.findMany({
        where: { id: { in: [idA, idB] } },
    });

    if (users.length < 2) {
        logger.error('Failed to create conversation', { error: 'One or both users not found', requestId: req.id });
        return next(new createError(404, 'One or both users not found.'));
    }

    const conversation = await findOrCreateConversation(idA, idB);

    logger.info({
        event: "createConversation",
        outcome: "Success",
        conversationId: conversation.id,
        participantA: idA,
        participantB: idB,
        staffId: staffId || null,
    }, "Conversation established successfully");

    res.status(201).json({
        status: "success",
        data: {
            conversation
        },
    });
});

//-------------------------------------------------------------------------------
const getConversations = asyncErrorCatching(async (req, res, next) => {
    const { id } = req.params;

    if (!id) {
        logger.error('Failed to get conversations', { error: 'User ID is required', requestId: req.id });
        return next(new createError(400, 'User ID is required'));
    }

    if (req.user.id !== id && req.user.role !== 'ADMIN') {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.conversation);
    delete filterQuery['participants.userId'];
    const queryBuilder = new ApiFeatures(
        prisma.conversation,
        filterQuery,
        generateConversationOptions()
    );

    queryBuilder.query.where.AND.push({
        deletedAt: null,
        participants: {
            some: {
                userId: id,
                isHidden: false
            }
        }
    });

    const { data: chats, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to retrieve conversations', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    const dedupedChats = dedupeChatsByPairKey(chats);

    logger.info({
        event: "getConversations",
        outcome: "Success",
        userId: id,
        count: dedupedChats.length
    }, "Conversations retrieved successfully");

    res.status(200).json({
        status: "success",
        pagination,
        data: {
            chats: dedupedChats
        },
    });
});

//-------------------------------------------------------------------------------
const deleteConversation = asyncErrorCatching(async (req, res, next) => {
    const convoId = parseInt(req.params.id, 10);

    if (!convoId) {
        logger.error('Failed to delete conversation', { error: 'Conversation ID not found', requestId: req.id });
        return next(new createError(400, 'Conversation ID is required.'));
    }

    const exChat = await prisma.conversation.findUnique({
        where: { id: convoId },
        include: { participants: true }
    });

    if (!exChat) {
        logger.error('Failed to delete conversation', { error: 'Not found', conversationId: convoId, requestId: req.id });
        return next(new createError(404, 'Conversation not found'));
    }

    const isParticipant = exChat.participants.some(p => p.userId === req.user.id);
    if (!isParticipant && req.user.role !== 'ADMIN') {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    await prisma.conversationParticipant.update({
        where: {
            conversationId_userId: {
                conversationId: convoId,
                userId: req.user.id
            }
        },
        data: { isHidden: true, clearedAt: new Date() }
    });

    logger.info({
        event: "deleteConversation",
        outcome: "Success",
        conversationId: convoId
    }, "Conversation deleted successfully");

    res.status(204).json({
        status: 'success',
        data: null
    });
});

module.exports = {
    createConversation,
    deleteConversation,
    getConversations,
};
