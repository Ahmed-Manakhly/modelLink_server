const prisma = require("../prisma/prisma");
const createError = require("../utils/createError");
const asyncErrorCatching = require("../utils/asyncErrorCatching");
const ApiFeatures = require("../utils/ApiFeatures");
const { normalizeFilterQuery, FILTER_SPECS } = require("../utils/normalizeFilterQuery");
const { generateWalletTransactionOptions } = require("../utils/ApiFeaturesHelpersForWallets");
const logger = require("../utils/logger");

// Get or initialize user's wallet
exports.getWalletMe = asyncErrorCatching(async (req, res, next) => {
    let wallet = await prisma.wallet.findUnique({
        where: { userId: req.user.id }
    });

    if (!wallet) {
        wallet = await prisma.wallet.create({
            data: { userId: req.user.id }
        });
        logger.info("Created new wallet for user during lazy initialization", { userId: req.user.id, walletId: wallet.id });
    }

    res.status(200).json({
        status: "success",
        data: { wallet }
    });
});

// Get user's wallet transactions history
exports.getWalletTransactions = asyncErrorCatching(async (req, res, next) => {
    let wallet = await prisma.wallet.findUnique({
        where: { userId: req.user.id }
    });

    if (!wallet) {
        wallet = await prisma.wallet.create({
            data: { userId: req.user.id }
        });
    }

    // Force filtering by the user's wallet id
    const filterQuery = normalizeFilterQuery(req.query, FILTER_SPECS.walletTransaction);
    filterQuery.walletId = wallet.id;
    const queryBuilder = new ApiFeatures(
        prisma.walletTransaction,
        filterQuery,
        generateWalletTransactionOptions()
    );

    const { data: transactions, pagination, error } = await queryBuilder.execute();

    if (error) {
        return next(new createError(400, error));
    }

    res.status(200).json({
        status: "success",
        pagination,
        data: { transactions }
    });
});
