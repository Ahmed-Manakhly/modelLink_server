const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const APIFeatures = require("../utils/apiFeature");
const logger = require("../utils/logger");


exports.getAllReviews = asyncErrorCatching(async (req, res, next) => {

    const operation = new APIFeatures(req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();

    let userReviewsOption = {};



    if (req.user.role === "CLIENT")
        userReviewsOption.clientId = req.user.id;


    const reviews = await prisma.review.findMany({
        where: {
            ...operation.where,
            ...userReviewsOption,
        },
        orderBy: operation.orderBy,
        select: operation.select,
        skip: operation.skip,
        take: operation.take,
        include: {
            AiModel: true,
            Order: true,
            User: true,
        }
    });

    logger.info({
        userid: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        event: "getAllReviews",
        outcome: "Success",
    }, "User successfully retrieved reviews");

    res.status(200).send({
        status: "success",
        results: reviews.length,
        data: {
            reviews,
        },
    });
});
exports.getReviewByOrder = asyncErrorCatching(async (req, res, next) => { // by manakhly
    const orderId = +req.params.id
    const review = await prisma.review.findUnique({
        where: {
            orderId,
        },
    });
    if (!review) {
        return res.status(200).send({
            status: "success",
            data: {
                review: null
            },
        });
    }
    const userData = await prisma.user.findUnique({
        where: {
            id :review.clientId,
        },
    });
    if (userData) {
        const {avatar,org_username, first_name ,role , createdAt, country , id} = userData;
        review.userData =  {avatar,org_username, first_name ,role , createdAt, country , id};
    } else {
        review.userData = null;
    }
    res.status(200).send({
        status: "success",
        data: {
            review
        },
    });
});
exports.getReviewByModel = asyncErrorCatching(async (req, res, next) => { // by manakhly
    const aiModelId = +req.params.id
    const reviews = await prisma.review.findMany({
        orderBy: {
            updatedAt : 'desc'
        },
        where: {
            aiModelId,
        },
    });
    const allReviews = await Promise.all( 
        reviews.map(async (rev)=>{
            const {clientId} = rev
            const userData = await prisma.user.findUnique({
                where: {
                    id: clientId
                }
            });
            const {avatar,org_username, first_name ,role , createdAt, country , id} = userData
            const newRev = {...rev , userData :{avatar,org_username, first_name ,role , createdAt, country , id} }
            return newRev
        })
    )
    res.status(200).send({
        status: "success",
        data: {
            allReviews
        },
    });
});

exports.getReview = asyncErrorCatching(async (req, res, next) => {

    let userReviewsOption = {};
    if (req.user.role === "CLIENT") {
        userReviewsOption = {
            clientId: req.user.id,
        }
    }

    const review = await prisma.review.findUnique({
        where: {
            id: parseInt(req.params.id),
            ...userReviewsOption,
        },
        include: {
            AiModel: true,
            Order: true,
            User: true,
        },
    });

    if (!review) {
        return next(new createError(404, errorMessages.REVIEW_NOT_FOUND));
    }

    logger.info({
        userid: req.user.id,
        username: req.user.username,
        userRole: req.user.role,
        event: "getReview",
        outcome: "Success",
        reviewId: review.id,
    }, "User successfully retrieved a review");

    res.status(200).send({
        status: "success",
        data: {
            review,
        },
    });
});

exports.createReview = asyncErrorCatching(async (req, res, next) => {

    if (req.user.role === "DEVELOPER" || req.user.role === "ADMIN")
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW));

    const { desc} = req.body;
    const aiModelId = +req.body.aiModelId
    const orderId = +req.body.orderId
    const star = +req.body.star

    const review = await prisma.review.findFirst({
        where: {
            orderId,
            clientId: req.user.id,
        },
    });

    if (review)
        return next(new createError(403, errorMessages.ONLY_ONE_REVIEW_PER_MODEL));
    const newReview = await prisma.review.create({
        data: {
            aiModelId,
            clientId: req.user.id,
            orderId,
            desc,
            star
        }
    });
    const thisModel = await prisma.AiModel.findFirst({
        where: {
            id: aiModelId,
        },
    });
    const {starFrequency , totalStars } = thisModel
    const updatedModel = await prisma.AiModel.update({
        where: {
            id: aiModelId,
        },
        data: {
            starFrequency : starFrequency + 1 ,
            totalStars : totalStars + star
        },
    });
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

exports.updateReview = asyncErrorCatching(async (req, res, next) => {


    if (req.user.role === "DEVELOPER" || req.user.role === "ADMIN")
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW));


    let userReviewsOption = {};

    if (req.user.role === "CLIENT")
        userReviewsOption = {
            clientId: req.user.id,
        }

    const review = await prisma.review.findUnique({
        where: {
            id: parseInt(req.params.id),
            ...userReviewsOption,
        },
    });

    if (!review) {
        return next(new createError(404, errorMessages.REVIEW_NOT_FOUND));
    }

    let {desc, star} = req.body;

    const updatedReview = await prisma.review.update({
        where: {
            id: parseInt(req.params.id),
        },
        data: {
            desc,
            star
        }
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

exports.deleteReview = asyncErrorCatching(async (req, res, next) => {

    if (req.user.role === "DEVELOPER" || req.user.role === "ADMIN")
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW));

    let userReviewsOption = {};

    if (req.user.role === "CLIENT")
        userReviewsOption = {
            clientId: req.user.id,
        }

    const review = await prisma.review.findUnique({
        where: {
            id: parseInt(req.params.id),
            ...userReviewsOption,
        },
    });

    if (!review) {
        return next(new createError(404, errorMessages.REVIEW_NOT_FOUND));
    }

    await prisma.review.delete({
        where: {
            id: parseInt(req.params.id),
        },
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
