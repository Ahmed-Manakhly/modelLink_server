const Stripe = require('stripe');
const prisma = require('../prisma/prisma');
const createError = require('../utils/createError');
const asyncErrorCatching = require('../utils/asyncErrorCatching');
const { safeUserFields } = require('../utils/ApiFeaturesHelpersForUsers');
const { isMarketplaceDemo } = require('../utils/marketplaceDemo');

const getStripe = () => {
    if (!process.env.STRIPE) return null;
    return new Stripe(process.env.STRIPE);
};

const getClientWalletUrl = (query = '') => {
    const base = process.env.CLIENT_URL || 'http://localhost:3000';
    const clean = base.replace(/\/+$/, '');
    return `${clean}/wallet${query}`;
};

const buildConnectStatus = (user = {}) => ({
    stripeAccountId: user.stripeAccountId || null,
    stripeChargesEnabled: user.stripeChargesEnabled === true,
    stripeDetailsSubmitted: user.stripeDetailsSubmitted === true,
    payoutReady: user.stripeChargesEnabled === true && user.stripeDetailsSubmitted === true,
});

exports.getConnectStatus = asyncErrorCatching(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.status(200).json({
        status: 'success',
        data: buildConnectStatus(user),
    });
});

exports.onboardConnect = asyncErrorCatching(async (req, res, next) => {
    const stripe = getStripe();
    if (!stripe) {
        return next(new createError(
            503,
            'Stripe is not configured. Set STRIPE in .env or use Complete setup (demo) for local QA.'
        ));
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    let accountId = user.stripeAccountId;

    if (!accountId) {
        const account = await stripe.accounts.create({
            type: 'express',
            email: user.email,
            capabilities: { transfers: { requested: true } },
            metadata: { userId: user.id },
        });
        accountId = account.id;
        await prisma.user.update({
            where: { id: user.id },
            data: { stripeAccountId: accountId },
        });
    }

    const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: getClientWalletUrl('?stripe=refresh'),
        return_url: getClientWalletUrl('?stripe=return'),
        type: 'account_onboarding',
    });

    res.status(200).json({
        status: 'success',
        data: { url: accountLink.url },
    });
});

exports.completeConnectDemo = asyncErrorCatching(async (req, res, next) => {
    if (process.env.NODE_ENV === 'production' && !isMarketplaceDemo()) {
        return next(new createError(403, 'Demo Connect completion is not available in production.'));
    }

    const dummyAccountId = `acct_demo_${String(req.user.id).slice(-12)}`;
    const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
            stripeAccountId: req.user.stripeAccountId || dummyAccountId,
            stripeChargesEnabled: true,
            stripeDetailsSubmitted: true,
        },
        select: safeUserFields,
    });

    res.status(200).json({
        status: 'success',
        message: 'Stripe Connect demo setup complete.',
        data: {
            user,
            ...buildConnectStatus(user),
        },
    });
});
