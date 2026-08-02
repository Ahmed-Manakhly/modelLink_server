/**
 * FLOW 06 — Payout Lifecycle Bot
 * ============================================================
 * All 3 developers request full-balance payouts; admin approves each.
 *
 * Usage:
 *   node seeding_scripts/06_payout_lifecycle/bot.js
 * ============================================================
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL = process.env.API_URL || reference.env.API_URL;
const THROTTLE = reference.env.THROTTLE_MS || 1000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

async function login(email, password) {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    return res.data.token;
}

async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 06 — Payout Lifecycle Bot                  ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`   API: ${API_URL}\n`);

    const adminToken = await login(reference.admin.email, reference.admin.password);

    console.log('── Phase 1: Developer payout requests ──\n');

    for (const dev of reference.actors.developers) {
        const token = await login(dev.email, dev.password);

        const walletRes = await axios.get(`${API_URL}/wallets/me`, { headers: authHeaders(token) });
        const availableBalance = walletRes.data?.data?.wallet?.availableBalance ?? 0;

        if (availableBalance <= 0) {
            console.log(`   ⚠️  ${dev.id} has zero balance — skipping payout request`);
            continue;
        }

        const payoutsRes = await axios.get(`${API_URL}/payouts/me`, { headers: authHeaders(token) });
        const payouts = payoutsRes.data?.data?.payouts || [];
        const alreadyPending = payouts.some((p) => p.status === 'PENDING');
        if (alreadyPending) {
            console.log(`   ⏭️  ${dev.id} already has a PENDING payout — skipping`);
            continue;
        }

        await axios.post(
            `${API_URL}/payouts/request`,
            { amount: availableBalance },
            { headers: authHeaders(token) }
        );
        console.log(`   ✅ ${dev.id} payout request submitted — amount: $${availableBalance}`);
        await sleep(THROTTLE);
    }

    console.log('\n── Phase 2: Admin approves pending payouts ──\n');

    const allPayouts = await axios.get(`${API_URL}/payouts`, { headers: authHeaders(adminToken) });
    const pending = (allPayouts.data?.data?.payouts || []).filter((p) => p.status === 'PENDING');

    if (pending.length === 0) {
        console.log('   ⏭️  No pending payouts to approve');
    }

    for (const payout of pending) {
        await axios.patch(
            `${API_URL}/payouts/${payout.id}/approve`,
            {},
            { headers: authHeaders(adminToken) }
        );
        console.log(`   ✅ Payout #${payout.id} approved for developer userId ${payout.userId}`);
        await sleep(THROTTLE);
    }

    console.log('\n── Phase 3: Final wallet balances ──\n');

    for (const dev of reference.actors.developers) {
        const token = await login(dev.email, dev.password);
        const walletRes = await axios.get(`${API_URL}/wallets/me`, { headers: authHeaders(token) });
        const balance = walletRes.data?.data?.wallet?.availableBalance ?? 0;
        console.log(`   ${dev.id} final balance: $${balance}`);
    }

    console.log('\n🎉 Flow 06 complete — check Admin → Payout Approvals tab.\n');
}

run()
    .catch((e) => {
        console.error('❌ CRITICAL:', e.response?.data || e.message);
        process.exit(1);
    });
