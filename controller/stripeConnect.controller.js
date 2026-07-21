const Stripe = require('stripe');
const prisma = require('../prisma/prisma');
const createError = require('../utils/createError');
const asyncErrorCatching = require('../utils/asyncErrorCatching');
const { safeUserFields } = require('../utils/ApiFeaturesHelpersForUsers');


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
    let user = await prisma.user.findUnique({ where: { id: req.user.id } });

    // Active Sync: If DB says onboarding is incomplete but we have a real Stripe account ID, check Stripe instantly.
    // This bypasses the delay (or failure) of the local `account.updated` webhook.
    if (user.stripeAccountId && !user.stripeAccountId.startsWith('acct_demo_') && 
        (!user.stripeDetailsSubmitted || !user.stripeChargesEnabled)) {
        try {
            const stripe = getStripe();
            if (stripe) {
                const account = await stripe.accounts.retrieve(user.stripeAccountId);
                if (account.details_submitted !== user.stripeDetailsSubmitted || 
                    account.charges_enabled !== user.stripeChargesEnabled) {
                    user = await prisma.user.update({
                        where: { id: user.id },
                        data: {
                            stripeDetailsSubmitted: account.details_submitted,
                            stripeChargesEnabled: account.charges_enabled
                        }
                    });
                }
            }
        } catch (e) {
            // Silently fall back to DB if Stripe API is unreachable
        }
    }

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

    // Demo placeholder IDs (acct_demo_...) do not exist on Stripe.
    // Treat them as "no account" — clear will happen only AFTER Stripe succeeds.
    const isDemoAccount = accountId && accountId.startsWith('acct_demo_');
    if (isDemoAccount) {
        accountId = null;
    }

    try {
        if (!accountId) {
            const account = await stripe.accounts.create({
                type: 'express',
                email: user.email,
                capabilities: { transfers: { requested: true } },
                metadata: { userId: user.id },
            });
            accountId = account.id;

            // Only write to DB after Stripe succeeds — also clears any stale demo data
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    stripeAccountId: accountId,
                    // Clear demo flags if they were set
                    stripeChargesEnabled: false,
                    stripeDetailsSubmitted: false,
                },
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

    } catch (err) {
        // Stripe Connect not enabled on this platform account
        if (err?.raw?.code === 'account_invalid' || err?.message?.includes('signed up for Connect')) {
            return next(new createError(
                503,
                'Stripe Connect is not yet activated on this platform account. ' +
                'Please visit https://dashboard.stripe.com/connect to enable it, then try again.'
            ));
        }
        // Re-throw other Stripe errors
        return next(new createError(502, err.message || 'Stripe Connect error.'));
    }
});


exports.completeConnectDemo = asyncErrorCatching(async (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
        return next(new createError(403, 'Demo Connect completion is not available in production.'));
    }

    const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
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
