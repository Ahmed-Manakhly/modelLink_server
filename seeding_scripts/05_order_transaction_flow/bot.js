/**
 * FLOW 05 — Order, Payment & Ledger Bot
 * ============================================================
 * Simulates: 7 orders across 3 clients / 3 developers
 * Happy path: order → webhook → deliver → review
 * Dispute path: order → webhook → deliver → dispute → admin resolve
 *
 * Usage:
 *   node seeding_scripts/05_order_transaction_flow/bot.js
 * ============================================================
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH = path.join(__dirname, 'data_input.json');
const FLOW01_SESSION = path.join(__dirname, '..', '01_auth_profile_flow', 'session_state.json');

const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL = process.env.API_URL || reference.env.API_URL;
const THROTTLE = reference.env.THROTTLE_MS || 1000;
const PLATFORM_FEE_PERCENT = reference.platformFeeRef?.platformFeePercent ?? 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

function assertWebhookEnv() {
    if (process.env.STRIPE_WEBHOOK_SECRET) {
        console.error('❌ STRIPE_WEBHOOK_SECRET is set — mock webhook will fail signature verification.');
        console.error('   For seeding: comment out STRIPE_WEBHOOK_SECRET in .env');
        process.exit(1);
    }
}

async function getWallet(devToken) {
    const res = await axios.get(`${API_URL}/wallets/me`, { headers: authHeaders(devToken) });
    return res.data?.data?.wallet || { availableBalance: 0, pendingBalance: 0 };
}

function expectedDeveloperNet(gross) {
    const platformFee = Math.round(gross * (PLATFORM_FEE_PERCENT / 100));
    return gross - platformFee;
}

async function assertWalletCredited(order, devToken, walletBefore) {
    const walletAfter = await getWallet(devToken);
    const expectedNet = expectedDeveloperNet(order.purchasePrice);
    const pendingIncrement = walletAfter.pendingBalance - (walletBefore.pendingBalance ?? 0);

    if (pendingIncrement < expectedNet) {
        throw new Error(
            `Wallet pending credit mismatch for order #${order.id}: +$${pendingIncrement} pending (expected ≥ $${expectedNet})`
        );
    }

    const txRes = await axios.get(`${API_URL}/wallets/transactions`, {
        headers: authHeaders(devToken),
        params: { limit: 20 }
    });
    const transactions = txRes.data?.data?.transactions || [];
    const saleTx = transactions.find((t) => t.type === 'SALE' && t.orderId === order.id);
    if (!saleTx) {
        throw new Error(`No SALE WalletTransaction found for order #${order.id}`);
    }

    console.log(
        `   ✅ Wallet credited — +$${pendingIncrement} pending (net ~$${expectedNet}), tx #${saleTx.id}`
    );
}

async function getToken(actorId, email, password) {
    if (fs.existsSync(FLOW01_SESSION)) {
        const session = JSON.parse(fs.readFileSync(FLOW01_SESSION, 'utf8'));
        if (session[actorId]?.token) return session[actorId].token;
    }
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    return res.data.token;
}

async function loginActor(actorKey) {
    const actor = reference.actors[actorKey];
    if (!actor) throw new Error(`Unknown actor: ${actorKey}`);
    const token = await getToken(actorKey, actor.email, actor.password);
    return { token, actor };
}

function loadQueue() {
    if (!fs.existsSync(INPUT_PATH)) return null;
    const raw = fs.readFileSync(INPUT_PATH, 'utf8').trim();
    if (raw === '' || raw === '[]') return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.orders && parsed.orders.length === 0) return null;
        return parsed;
    } catch {
        return null;
    }
}

function initQueue() {
    console.log('♻️  data_input.json empty — copying from data_reference.json...\n');
    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const queue = { orders: [...ref.orders] };
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
    return queue;
}

function removeOrderFromQueue(orderId) {
    const queue = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    queue.orders = queue.orders.filter((o) => o.id !== orderId);
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
}

async function findModel(modelTitle) {
    const params = new URLSearchParams({ search: modelTitle }).toString();
    const res = await axios.get(`${API_URL}/aiModel?${params}`);
    const models = res.data?.data?.models || res.data?.data?.aiModels || [];
    return models.find((m) => m.title === modelTitle) || null;
}

async function orderAlreadyExists(buyerToken, modelId) {
    const res = await axios.get(`${API_URL}/orders`, {
        headers: authHeaders(buyerToken),
        params: { aiModelId: modelId }
    });
    const orders = res.data?.data?.orders || [];
    return orders.find((o) => ['PENDING', 'PAID', 'DELIVERED', 'DISPUTED'].includes(o.status)) || null;
}

async function createOrder(model, buyerToken) {
    const primaryVersion = model.versions?.find((v) => v.isPrimary) || model.versions?.[0];
    if (!primaryVersion) throw new Error('No version found on model');

    const res = await axios.post(
        `${API_URL}/orders/create-payment-intent`,
        { aiModelId: model.id, versionId: primaryVersion.id },
        { headers: authHeaders(buyerToken) }
    );

    return {
        order: res.data.data.order,
        version: primaryVersion
    };
}

async function triggerMockWebhook(order) {
    const webhookPayload = {
        id: `evt_seed_${Date.now()}_${order.id}`,
        type: 'payment_intent.succeeded',
        data: {
            object: {
                id: order.stripePaymentIntentId
            }
        }
    };

    await axios.post(`${API_URL}/orders/stripe-webhook`, webhookPayload, {
        headers: { 'Content-Type': 'application/json' }
    });
}

async function assertReviewBlocked(order, version, buyerToken) {
    try {
        await axios.post(
            `${API_URL}/reviews`,
            {
                orderId: order.id,
                aiModelId: order.aiModelId,
                versionId: version.id,
                star: 5,
                desc: 'Gate check — should fail before delivery'
            },
            { headers: authHeaders(buyerToken) }
        );
        throw new Error('Review gate FAILED — review was accepted before delivery');
    } catch (err) {
        const status = err.response?.status;
        if (status === 400 || status === 403) {
            console.log('   ✅ Review gate verified (blocked before delivery)');
            return;
        }
        throw err;
    }
}

async function deliverOrder(orderId, devToken) {
    await axios.patch(`${API_URL}/orders/${orderId}/deliver`, {}, {
        headers: authHeaders(devToken)
    });
}

async function submitReview(order, version, review, buyerToken) {
    await axios.post(
        `${API_URL}/reviews`,
        {
            orderId: order.id,
            aiModelId: order.aiModelId,
            versionId: version.id,
            star: review.star,
            desc: review.desc
        },
        { headers: authHeaders(buyerToken) }
    );
}

async function resolveDispute(orderDef, order, adminToken) {
    const disputesRes = await axios.get(`${API_URL}/disputes`, {
        headers: authHeaders(adminToken)
    });
    const disputes = disputesRes.data?.data?.disputes || [];
    const openDispute = disputes.find((d) => d.orderId === order.id && d.status === 'OPEN');
    if (!openDispute) {
        const resolved = disputes.find(
            (d) => d.orderId === order.id && (d.status === 'RESOLVED' || d.status === 'REJECTED')
        );
        if (resolved) {
            console.log(`   ⏭️  Dispute for order #${order.id} already ${resolved.status} — skipping resolve`);
            return { skipped: true };
        }
        throw new Error(`Open dispute not found for order ${order.id}`);
    }

    await axios.patch(
        `${API_URL}/disputes/${openDispute.id}/resolve`,
        {
            resolution: orderDef.dispute.resolution,
            notes: orderDef.dispute.adminNotes
        },
        { headers: authHeaders(adminToken) }
    );
    console.log(`   ✅ Dispute #${openDispute.id} resolved (${orderDef.dispute.resolution})`);
    return { skipped: false };
}

async function processHappyPath(orderDef, buyerToken, devToken, model) {

    const existing = await orderAlreadyExists(buyerToken, model.id);
    if (existing) {
        console.log(`   ⏭️  ${orderDef.id} already exists (order #${existing.id}, ${existing.status}) — skipping`);
        return { skipped: true };
    }

    const walletBefore = await getWallet(devToken);

    console.log(`   ✅ Model found (ID: ${model.id})`);
    const { order, version } = await createOrder(model, buyerToken);
    console.log(`   ✅ Order created (ID: ${order.id}, status: ${order.status})`);

    await triggerMockWebhook(order);
    order.status = 'PAID';
    console.log('   ✅ Payment webhook processed → PAID');

    await assertWalletCredited(order, devToken, walletBefore);

    await assertReviewBlocked(order, version, buyerToken);
    await deliverOrder(order.id, devToken);
    console.log('   ✅ Order marked DELIVERED');

    if (orderDef.review) {
        await submitReview(order, version, orderDef.review, buyerToken);
        console.log(`   ✅ Review submitted (⭐ ${orderDef.review.star}/5)`);
    }

    return { skipped: false };
}

async function processDisputePath(orderDef, buyerToken, devToken, adminToken, model) {

    const existing = await orderAlreadyExists(buyerToken, model.id);
    let order;
    let version;

    if (existing) {
        console.log(`   ⏭️  ${orderDef.id} already exists (order #${existing.id}, ${existing.status})`);
        order = existing;
        version = model.versions?.find((v) => v.isPrimary) || model.versions?.[0];

        const disputesRes = await axios.get(`${API_URL}/disputes`, {
            headers: authHeaders(adminToken)
        });
        const disputes = disputesRes.data?.data?.disputes || [];
        const done = disputes.find(
            (d) => d.orderId === order.id && (d.status === 'RESOLVED' || d.status === 'REJECTED')
        );
        if (done) {
            console.log(`   ⏭️  ${orderDef.id} dispute already ${done.status} — skipping`);
            return { skipped: true };
        }
    } else {
        const walletBefore = await getWallet(devToken);
        console.log(`   ✅ Model found (ID: ${model.id})`);
        ({ order, version } = await createOrder(model, buyerToken));
        console.log(`   ✅ Order created (ID: ${order.id}, status: ${order.status})`);
        await triggerMockWebhook(order);
        order.status = 'PAID';
        console.log('   ✅ Payment webhook processed → PAID');
        await assertWalletCredited(order, devToken, walletBefore);
    }

    if (order.status === 'PAID') {
        await assertReviewBlocked(order, version, buyerToken);
        await deliverOrder(order.id, devToken);
        order.status = 'DELIVERED';
        console.log('   ✅ Order marked DELIVERED');
    }

    if (order.status === 'DELIVERED') {
        try {
            await axios.post(
                `${API_URL}/disputes`,
                { orderId: order.id, reason: orderDef.dispute.reason },
                { headers: authHeaders(buyerToken) }
            );
            order.status = 'DISPUTED';
            console.log('   ✅ Dispute opened → order DISPUTED');
        } catch (err) {
            if (order.status === 'DISPUTED' || err.response?.status === 400) {
                console.log('   ⏭️  Dispute already open for this order');
                order.status = 'DISPUTED';
            } else {
                throw err;
            }
        }
    }

    await resolveDispute(orderDef, order, adminToken);
    return { skipped: false };
}

async function run() {
    assertWebhookEnv();

    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 05 — Order, Payment & Ledger Bot           ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`   API: ${API_URL}\n`);

    let queue = loadQueue();
    if (!queue) queue = initQueue();

    const adminLogin = await axios.post(`${API_URL}/auth/login`, {
        email: reference.admin.email,
        password: reference.admin.password
    });
    const adminToken = adminLogin.data.token;

    let ok = 0;
    let skip = 0;
    let fail = 0;

    for (const orderDef of [...queue.orders]) {
        console.log('──────────────────────────────────────────────────');
        console.log(`➡  Order: ${orderDef.id} (${orderDef.path})`);
        console.log(`   Buyer: ${orderDef.buyer} | Dev: ${orderDef.developer}`);
        console.log(`   Model: "${orderDef.modelTitle}"`);

        try {
            const { token: buyerToken } = await loginActor(orderDef.buyer);
            
            const model = await findModel(orderDef.modelTitle);
            if (!model) throw new Error(`Model not found: "${orderDef.modelTitle}" — run Flow 03 first`);
            
            const sessionData = JSON.parse(fs.readFileSync(FLOW01_SESSION, 'utf8'));
            let actualDevKey = orderDef.developer;
            for (const [key, data] of Object.entries(sessionData)) {
                if (data.userId === model.developerId) {
                    actualDevKey = key;
                    break;
                }
            }
            
            const { token: devToken } = await loginActor(actualDevKey);

            let result;
            if (orderDef.path === 'dispute') {
                result = await processDisputePath(orderDef, buyerToken, devToken, adminToken, model);
            } else {
                result = await processHappyPath(orderDef, buyerToken, devToken, model);
            }

            if (result.skipped) {
                skip++;
            } else {
                removeOrderFromQueue(orderDef.id);
                ok++;
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.error(`   ❌ FAILED: ${msg}`);
            fail++;
        }

        await sleep(THROTTLE);
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ ${ok} completed | ⏭ ${skip} skipped | ❌ ${fail} failed   ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');
    if (fail > 0) process.exit(1);
}

run().catch((e) => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
