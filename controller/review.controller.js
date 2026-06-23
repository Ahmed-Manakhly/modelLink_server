const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS } = require("../utils/normalizeFilterQuery");
const { generateReviewOptions } = require("../utils/ApiFeaturesHelpersForReviews");
const logger = require("../utils/logger");
const recalcAvgRating = require("../utils/recalcAvgRating");
const { createNotificationRecord, emitNotification } = require("../utils/createAndEmitNotification");


exports.getAllReviews = asyncErrorCatching(async (req, res, next) => {

    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.review);

    const queryBuilder = new ApiFeatures(
        prisma.review,
        filterQuery,
        generateReviewOptions()
    );

    if (req.user.role === "CLIENT") {
        queryBuilder.query.where.AND.push({ clientId: req.user.id });
    }

    if (req.user.role === "DEVELOPER") {
        queryBuilder.query.where.AND.push({
            AiModel: { developerId: req.user.id },
        });
    }

    const { data: reviews, pagination, error } = await queryBuilder.execute();

    if (error) {
        logger.error('Failed to get all reviews', { error, requestId: req.id });
        return next(new createError(400, error));
    }

    logger.info({
        userid: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        event: "getAllReviews",
        outcome: "Success",
    }, "User successfully retrieved reviews");

    res.status(200).json({
        status: "success",
        pagination,
        data: {
            reviews,
        },
    });
});
//--------------------------------------------
exports.getReviewByOrder = asyncErrorCatching(async (req, res, next) => { // by manakhly
    const orderId = +req.params.id;
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.review);
    delete filterQuery.orderId;
    const queryBuilder = new ApiFeatures(prisma.review, filterQuery, generateReviewOptions());
    if (orderId && !isNaN(orderId)) {
        queryBuilder.query.where.AND.push({ orderId });
    }
    const { data: reviews, error } = await queryBuilder.execute();
    if (error) {
        return next(new createError(400, error));
    }
    const review = reviews[0] || null;
    if (review) {
        review.userData = review.User || null;
    }
    logger.info({
        userid: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        event: "getReviewByOrder",
        outcome: "Success",
        orderId: req.params.id,
    }, "User successfully retrieved review by order");

    res.status(200).json({
        status: "success",
        data: {
            review,
        },
    });
});
//--------------------------------------------
exports.getReviewByModel = asyncErrorCatching(async (req, res, next) => { // by manakhly
    const aiModelId = parseInt(req.params.id, 10);
    if (isNaN(aiModelId)) {
        return next(new createError(400, 'Invalid AI model ID.'));
    }

    const aiModel = await prisma.aiModel.findUnique({
        where: { id: aiModelId },
        select: { id: true, status: true, developerId: true, deletedAt: true },
    });
    if (!aiModel || aiModel.deletedAt) {
        return next(new createError(404, 'AI Model not found.'));
    }

    const isModelOwner = req.user?.id === aiModel.developerId;
    const isStaff = req.user?.role === 'ADMIN' || req.user?.role === 'EMPLOYEE';
    if (aiModel.status !== 'PUBLISHED' && !isModelOwner && !isStaff) {
        return next(new createError(403, 'You do not have permission to view reviews for this model.'));
    }

    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.review);
    delete filterQuery.aiModelId;
    const queryBuilder = new ApiFeatures(prisma.review, filterQuery, generateReviewOptions());
    queryBuilder.query.where.AND.push({ aiModelId });
    const { data: reviews, pagination, error } = await queryBuilder.execute();
    if (error) {
        logger.error('Failed to get review by model', { error, requestId: req.id });
        return next(new createError(400, error));
    }
    const allReviews = reviews.map((rev) => {
        rev.userData = rev.User || null;
        delete rev.User;
        return rev;
    });
    logger.info({
        userid: req.user?.id ?? null,
        username: req.user?.org_username ?? 'anonymous',
        userRole: req.user?.role ?? 'anonymous',
        event: "getReviewByModel",
        outcome: "Success",
        aiModelId: req.params.id,
    }, "User successfully retrieved review by model");

    res.status(200).json({
        status: "success",
        pagination,
        data: {
            allReviews,
        },
    });
});
//--------------------------------------------
exports.getReview = asyncErrorCatching(async (req, res, next) => {
    const reviewId = parseInt(req.params.id, 10);
    const filter = { id: reviewId };

    if (req.user.role === "CLIENT") {
        filter.clientId = req.user.id;
    }

    const review = await prisma.review.findFirst({
        where: filter,
        include: {
            User: {
                select: {
                    id: true,
                    org_username: true,
                    avatar: true,
                    first_name: true,
                    role: true,
                    createdAt: true,
                    country: true
                }
            }
        }
    });

    if (!review) {
        logger.warn('Review not found', { reviewId, userId: req.user.id, requestId: req.id });
        return next(new createError(404, errorMessages.REVIEW_NOT_FOUND));
    }

    if (review.User) {
        const { avatar, org_username, first_name, role, createdAt, country, id } = review.User;
        review.userData = { avatar, org_username, first_name, role, createdAt, country, id };
        delete review.User;
    } else {
        review.userData = null;
    }

    logger.info({
        userid: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        event: "getReview",
        outcome: "Success",
        reviewId: review.id,
    }, "User successfully retrieved a review");

    res.status(200).json({
        status: "success",
        data: {
            review,
        },
    });
});
//--------------------------------------------
exports.createReview = asyncErrorCatching(async (req, res, next) => {
    if (req.user.role === "DEVELOPER" || req.user.role === "ADMIN")
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW));

    const { desc } = req.body;
    const aiModelId = +req.body.aiModelId;
    const orderId = +req.body.orderId;
    const star = +req.body.star;

    const order = await prisma.order.findUnique({
        where: { id: orderId }
    });

    if (!order) {
        return next(new createError(404, "Associated order not found."));
    }

    if (order.clientId !== req.user.id) {
        logger.warn('Review ownership validation failed', {
            userId: req.user.id,
            orderId,
            orderClientId: order.clientId,
            requestId: req.id
        });
        return next(new createError(403, "You are not authorized to review this order. Only the order owner can create a review."));
    }

    if (order.status !== 'DELIVERED') {
        logger.warn('Review order status validation failed', {
            userId: req.user.id,
            orderId,
            orderStatus: order.status,
            requestId: req.id
        });
        return next(new createError(400, "Review can only be created for delivered orders."));
    }

    const review = await prisma.review.findFirst({
        where: {
            aiModelId,
            clientId: req.user.id,
        },
    });

    if (review)
        return next(new createError(403, errorMessages.ONLY_ONE_REVIEW_PER_MODEL));

    let notificationToEmit = null;
    const newReview = await prisma.$transaction(async (tx) => {
        const createdReview = await tx.review.create({
            data: {
                aiModelId,
                versionId: order.versionId,
                clientId: req.user.id,
                orderId,
                desc,
                star
            }
        });

        await tx.aiModel.update({
            where: { id: aiModelId },
            data: {
                starFrequency: { increment: 1 },
                totalStars: { increment: star },
                reviewCount: { increment: 1 }
            }
        });

        notificationToEmit = await createNotificationRecord({
            actionDesc: `A new review has been submitted for your AI model.`,
            type: 'REVIEW',
            recipientId: order.developerId,
            senderId: req.user.id,
            actionLink: `/models/view/${aiModelId}`,
            unRead: true,
        }, tx);

        await recalcAvgRating(aiModelId, tx);

        return createdReview;
    });

    emitNotification(req.app.get('io'), notificationToEmit);

    logger.info({
        userid: req.user.id,
        username: req.user.username,
        event: "createReview",
        outcome: "Success",
        reviewId: newReview.id,
    }, "Client successfully created a review");

    res.status(201).send({
        status: "success",
        data: {
            review: newReview,
        },
    });
});
//--------------------------------------------
exports.updateReview = asyncErrorCatching(async (req, res, next) => {
    if (req.user.role === "DEVELOPER" || req.user.role === "ADMIN")
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW));

    let userReviewsOption = {};

    if (req.user.role === "CLIENT")
        userReviewsOption = {
            clientId: req.user.id,
        };

    const review = await prisma.review.findUnique({
        where: {
            id: parseInt(req.params.id),
            ...userReviewsOption,
        },
    });

    if (!review) {
        return next(new createError(404, errorMessages.REVIEW_NOT_FOUND));
    }

    let { desc, star } = req.body;
    const starDiff = (star !== undefined && star !== null) ? (+star - review.star) : 0;

    const updatedReview = await prisma.$transaction(async (tx) => {
        const updated = await tx.review.update({
            where: { id: parseInt(req.params.id) },
            data: {
                desc,
                star: star !== undefined ? +star : undefined
            }
        });

        if (starDiff !== 0) {
            await tx.aiModel.update({
                where: { id: review.aiModelId },
                data: {
                    totalStars: { increment: starDiff }
                }
            });
            await recalcAvgRating(review.aiModelId, tx);
        }

        return updated;
    });

    logger.info({
        userid: req.user.id,
        username: req.user.username,
        event: "updateReview",
        outcome: "Success",
        reviewId: updatedReview.id,
    }, "Client successfully updated a review");

    res.status(200).send({
        status: "success",
        data: {
            review: updatedReview,
        },
    });
});
//--------------------------------------------
exports.deleteReview = asyncErrorCatching(async (req, res, next) => {
    if (req.user.role === "DEVELOPER" || req.user.role === "ADMIN")
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW));

    let userReviewsOption = {};

    if (req.user.role === "CLIENT")
        userReviewsOption = {
            clientId: req.user.id,
        };

    const review = await prisma.review.findUnique({
        where: {
            id: parseInt(req.params.id),
            ...userReviewsOption,
        },
    });

    if (!review) {
        return next(new createError(404, errorMessages.REVIEW_NOT_FOUND));
    }

    await prisma.$transaction(async (tx) => {
        await tx.review.delete({
            where: { id: parseInt(req.params.id) },
        });

        await tx.aiModel.update({
            where: { id: review.aiModelId },
            data: {
                starFrequency: { decrement: 1 },
                totalStars: { decrement: review.star },
                reviewCount: { decrement: 1 }
            }
        });

        await recalcAvgRating(review.aiModelId, tx);
    });

    logger.info({
        userid: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        event: "deleteReview",
        outcome: "Success",
        reviewId: review.id,
    }, "User successfully deleted a review");

    res.status(204).json({
        status: "success",
        data: null,
    });
});
