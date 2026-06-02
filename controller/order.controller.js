const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const errorMessages = require("../utils/errorMessages");
const prisma = require("../prisma/prisma");
const Stripe = require("stripe");
const APIFeatures = require("../utils/apiFeature");
const logger = require("../utils/logger");

exports.getAllOrders = asyncErrorCatching(async (req, res, next) => {
    const operation = new APIFeatures(req.query)
        .filter()
        .sort()
        .limitFields()
        .paginate();

    let userOrdersOption = {};

    if (req.user.role === "CLIENT")
        userOrdersOption = {
            clientId: req.user.id,
        }
    else if (req.user.role === "DEVELOPER")
        userOrdersOption = {
            developerId: req.user.id,
        }

    const orders = await prisma.order.findMany({
        where: {
            ...operation.where,
            ...userOrdersOption,
        },

    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "getAllOrders",
        outcome: "Success",
        orderCount: orders.length
    }, "User successfully retrieved orders");

    res.status(200).send({
        status: "success",
        results: orders.length,
        data: {
            orders,
        },
    });
});
//========================== by manakhly
exports.getOrdersByModel = asyncErrorCatching(async (req, res, next) => {
    const modelId = +req.params.id

    const orders = await prisma.order.findMany({
        orderBy: {
            updatedAt: 'desc'
        },
        where: {
            aiModelId: modelId,
        },

    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "getAllOrders",
        outcome: "Success",
        orderCount: orders.length
    }, "User successfully retrieved orders");

    res.status(200).send({
        status: "success",
        results: orders.length,
        data: {
            orders,
        },
    });
});
//--------------------------------------------
exports.getOrdersByDev = asyncErrorCatching(async (req, res, next) => {

    const devId = req.params.id

    const orders = await prisma.order.findMany({
        orderBy: {
            updatedAt: 'desc'
        },
        where: {
            developerId: devId,
        },

    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "getAllOrders",
        outcome: "Success",
        orderCount: orders.length
    }, "User successfully retrieved orders");

    res.status(200).send({
        status: "success",
        results: orders.length,
        data: {
            orders,
        },
    });
});
//--------------------------------------------
exports.getOrdersByClient = asyncErrorCatching(async (req, res, next) => {

    const clientId = req.params.id

    const orders = await prisma.order.findMany({
        orderBy: {
            updatedAt: 'desc'
        },
        where: {
            clientId: clientId,
        },

    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "getAllOrders",
        outcome: "Success",
        orderCount: orders.length
    }, "User successfully retrieved orders");

    res.status(200).send({
        status: "success",
        results: orders.length,
        data: {
            orders,
        },
    });
});
//=====================================================================
exports.getOrder = asyncErrorCatching(async (req, res, next) => {

    let userOrdersOption = {};

    if (req.user.role === "CLIENT") {
        userOrdersOption = {
            clientId: req.user.id,
        }
    } else if (req.user.role === "DEVELOPER") {
        userOrdersOption = {
            developerId: req.user.id,
        }
    }

    let order = await prisma.order.findUnique({
        where: {
            id: +req.params.id,
            ...userOrdersOption,
        },
    });

    if (!order) {
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }
    const { clientId } = order //========================== by manakhly
    const clientData = await prisma.user.findUnique({
        where: {
            id: clientId
        }
    });
    const { developerId } = order
    const developerData = await prisma.user.findUnique({
        where: {
            id: developerId
        }
    });
    const { aiModelId } = order
    const aiModelData = await prisma.AiModel.findUnique({
        where: {
            id: parseInt(aiModelId)
        }
    });
    order = { ...order, clientData, developerData, aiModelData }

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "getOrder",
        outcome: "Success",
        order: order.id
    }, "User successfully retrieved order");

    res.status(200).send({
        status: "success",
        data: {
            order,
        },
    });
});

exports.createOrderIntent = asyncErrorCatching(async (req, res, next) => {
    const stripe = new Stripe(process.env.STRIPE);

    const aiModel = await prisma.aiModel.findUnique({
        where: {
            id: +req.body.id,
        },
    });

    if (!aiModel) {
        return next(new createError(404, errorMessages.AI_MODEL_NOT_FOUND));
    }

    if (req.user.role === "DEVELOPER") {
        return next(new createError(403, errorMessages.ONLY_CUSTOMERS_CAN_CREATE_ORDER));
    }

    // const paymentIntent = await stripe.paymentIntents.create({
    //     amount: aiModel.price * 100,
    //     currency: "usd",
    //     automatic_payment_methods: {
    //         enabled: true,
    //     },
    // });

    let paymentIntent = {
        id: "pi_3LHtLbKZDnqz9H5pCf5PfXQH",
    }

    if (!paymentIntent) {
        return next(new createError(500, errorMessages.PAYMENT_ERROR));
    }

    const order = await prisma.order.create({
        data: {
            aiModelId: aiModel.id,
            price: aiModel.price,
            img: aiModel.cover,
            title: aiModel.title,
            clientId: req.user.id,
            developerId: aiModel.userId,
            payment_intent: paymentIntent.id,
        },
    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "createOrderIntent",
        outcome: "Success",
        order: order.id
    }, "User successfully created order Intent");

    res.status(200).send({
        status: "success",
        clientSecret: paymentIntent.client_secret,
        data: {
            order,
        },
    });
});

exports.confirmOrder = asyncErrorCatching(async (req, res, next) => {

    // it was by payment intent
    const order = await prisma.order.findUnique({
        where: {
            id: parseInt(req.params.id),
        },
    });

    if (!order) {
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }

    if (order.isCompleted) {
        return next(new createError(400, errorMessages.ORDER_ALREADY_CONFIRMED));
    }

    await prisma.order.update({
        where: {
            id: order.id,
        },
        data: {
            isCompleted: true,
        },
    });

    await prisma.user.update({
        where: {
            id: order.developerId,
        },
        data: {
            total_orders: {
                increment: 1,
            },
        },
    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "confirmOrder",
        outcome: "Success",
        order: order.id
    }, "User successfully confirmed order");

    res.status(200).send({
        status: "success",
        data: {
            order: {
                ...order,
                isCompleted: true,
            }
        },
    });
});

exports.deleteOrder = asyncErrorCatching(async (req, res, next) => {

    if (req.user.role === "CLIENT") {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    } else if (req.user.role === "DEVELOPER") {
        return next(new createError(403, errorMessages.NOT_AUTHORIZED));
    }

    const order = await prisma.order.findUnique({
        where: {
            id: parseInt(req.params.id),
        },
    });

    if (!order) {
        return next(new createError(404, errorMessages.ORDER_NOT_FOUND));
    }

    await prisma.order.delete({
        where: {
            id: order.id,
        },
    });

    logger.info({
        userCustomId: req.user.customId,
        username: req.user.org_username,
        role: req.user.role,
        event: "deleteOrder",
        outcome: "Success",
        order: order.id
    }, "User successfully deleted order");

    res.status(204).json({
        status: "success",
        data: null
    });
});
