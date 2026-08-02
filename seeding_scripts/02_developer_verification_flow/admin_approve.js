/**
 * FLOW 02b — Admin Approval Bot
 * ============================================================
 * Simulates an Admin logging in, fetching all PENDING
 * verification requests, and approving each one.
 *
 * Run AFTER bot.js (which submits the developer docs):
 *   node seeding_scripts/02_developer_verification_flow/admin_approve.js
 *
 * For local dev testing (approve YOUR account or any pending user), use:
 *   node seeding_scripts/dev_tools/approve_pending_verifications.js
 * ============================================================
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const reference      = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL        = process.env.API_URL || reference.env.API_URL;

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@modelLink.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'A@1234567891a';

const SEED_DEV_EMAILS = new Set([
    'seed_dev_01@modellink.com',
    'seed_dev_02@modellink.com',
    'seed_dev_03@modellink.com',
    'seed_dev_04@modellink.com',
]);

async function getAdminToken() {
    const res = await axios.post(`${API_URL}/auth/login`, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
    });
    return res.data.token;
}

async function getPendingVerifications(token) {
    const res = await axios.get(`${API_URL}/verifications?status=PENDING&limit=100`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.data.data?.verifications || [];
}

async function approve(verificationId, token) {
    const res = await axios.patch(
        `${API_URL}/verifications/${verificationId}/approve`,
        { reason: 'Approved by seeding bot — documents verified.' },
        { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.data.data?.verification;
}

async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 02b — Admin Verification Approval Bot      ║');
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`   API: ${API_URL}\n`);

    let adminToken;
    try {
        adminToken = await getAdminToken();
        console.log(`   🔑 Admin token acquired\n`);
    } catch (err) {
        console.error(`   ❌ Admin login failed: ${err.response?.data?.message || err.message}`);
        process.exit(1);
    }

    const pending = await getPendingVerifications(adminToken);
    if (pending.length === 0) {
        console.log('   ℹ️  No PENDING verifications found.\n');
        return;
    }

    console.log(`   Found ${pending.length} PENDING verification(s):\n`);

    let ok = 0, fail = 0, skipped = 0;
    for (const v of pending) {
        const devEmail = v.user?.email?.toLowerCase();
        console.log(`──────────────────────────────────────────────────`);
        console.log(`➡  Verification #${v.id} — User: ${v.userId}${devEmail ? ` (${devEmail})` : ''}`);

        if (devEmail && !SEED_DEV_EMAILS.has(devEmail)) {
            console.log(`   ⏭️  Skipped — not a seed developer`);
            skipped++;
            continue;
        }

        try {
            await approve(v.id, adminToken);
            console.log(`   ✅ APPROVED — developer isVerified: true`);
            ok++;
        } catch (err) {
            console.error(`   ❌ FAILED: ${err.response?.data?.message || err.message}`);
            fail++;
        }
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ ${ok} approved | ⏭ ${skipped} skipped | ❌ ${fail} failed ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');
}

run().catch(e => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
