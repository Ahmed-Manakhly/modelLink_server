#!/usr/bin/env node
/**
 * Dev utility — approve pending developer verifications as admin.
 *
 * Use when testing locally: sign up as a developer, submit verification docs
 * in the UI, then run this script to approve without logging into the admin panel.
 *
 * Unlike Flow 02b (admin_approve.js), this approves ALL pending requests by default.
 *
 * Usage:
 *   node seeding_scripts/dev_tools/approve_pending_verifications.js
 *   node seeding_scripts/dev_tools/approve_pending_verifications.js --email=you@example.com
 *   node seeding_scripts/dev_tools/approve_pending_verifications.js --list
 *   node seeding_scripts/dev_tools/approve_pending_verifications.js --dry-run
 *
 * Env (optional):
 *   API_URL=http://localhost:8000/api
 *   ADMIN_EMAIL=admin@modelLink.com
 *   ADMIN_PASSWORD=A@1234567891a
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REFERENCE_PATH = path.join(__dirname, '..', '00_taxonomy_categories_flow', 'data_reference.json');
const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));

const API_URL = process.env.API_URL || reference.env.API_URL;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || reference.admin.email;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || reference.admin.password;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const listOnly = args.includes('--list');
const emailArg = args.find((a) => a.startsWith('--email='));
const filterEmail = emailArg ? emailArg.split('=')[1].trim().toLowerCase() : null;

function authHeaders(token) {
    return { Authorization: `Bearer ${token}` };
}

async function getAdminToken() {
    const res = await axios.post(`${API_URL}/auth/login`, {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD
    });
    return res.data.token;
}

async function getPendingVerifications(token) {
    const res = await axios.get(`${API_URL}/verifications?status=PENDING&limit=100`, {
        headers: authHeaders(token)
    });
    return res.data.data?.verifications || [];
}

async function lookupUserByEmail(token, email) {
    const res = await axios.get(`${API_URL}/admin/users`, {
        headers: authHeaders(token),
        params: {
            email,
            limit: 1,
            fields: 'email,role,first_name,last_name,verification.id,verification.status,verification.documentUrl,verification.rejectionReason,verification.verifiedAt'
        }
    });
    return (res.data.data?.users || [])[0] || null;
}

async function findVerificationForEmail(token, email) {
    const res = await axios.get(`${API_URL}/verifications`, {
        headers: authHeaders(token),
        params: {
            search: email,
            limit: 10,
            fields: 'id,status,documentUrl,userId,user.email,user.role'
        }
    });
    const rows = res.data.data?.verifications || [];
    return rows.find((v) => v.user?.email?.toLowerCase() === email.toLowerCase()) || rows[0] || null;
}

async function approve(verificationId, token) {
    const res = await axios.patch(
        `${API_URL}/verifications/${verificationId}/approve`,
        { reason: 'Approved by dev_tools script — local testing.' },
        { headers: authHeaders(token) }
    );
    return res.data.data?.verification;
}

function printVerificationStatus(user, verification) {
    const email = user?.email || verification?.user?.email || '(unknown)';
    const role = user?.role || verification?.user?.role || '(unknown)';
    const status = verification?.status || '(no record)';
    const hasDoc = Boolean(verification?.documentUrl);

    console.log(`   User:   ${email}`);
    console.log(`   Role:   ${role}`);
    console.log(`   Status: ${status}${verification?.id ? ` (#${verification.id})` : ''}`);
    console.log(`   Doc:    ${hasDoc ? verification.documentUrl : 'not uploaded'}`);

    if (status === 'REJECTED' && verification?.rejectionReason) {
        console.log(`   Reason: ${verification.rejectionReason}`);
    }
    if (status === 'APPROVED' && verification?.verifiedAt) {
        console.log(`   Verified: ${verification.verifiedAt}`);
    }
}

function explainNoAction(user, verification) {
    if (!user) {
        console.log('   ❌ No user found with that email.');
        console.log('   Tip: register first, then submit verification in Profile Settings.');
        return;
    }

    if (user.role !== 'DEVELOPER') {
        console.log(`   ❌ Account role is ${user.role}, not DEVELOPER.`);
        console.log('   Tip: sign up with role DEVELOPER, or change role in admin panel.');
        return;
    }

    if (!verification) {
        console.log('   ❌ No verification record yet.');
        console.log('   Tip: go to Profile Settings → Developer Identity Verification → upload a PDF/image and submit.');
        return;
    }

    if (verification.status === 'APPROVED') {
        console.log('   ✅ Already APPROVED — nothing to do.');
        return;
    }

    if (verification.status === 'REJECTED') {
        console.log('   ⚠️  Verification was REJECTED. Re-submit a document in Profile Settings, then run this script again.');
        return;
    }

    if (verification.status === 'PENDING' && !verification.documentUrl) {
        console.log('   ⚠️  Status is PENDING but no document is on file.');
        console.log('   Tip: upload a verification document in Profile Settings (admin queue hides empty submissions).');
        return;
    }
}

async function resolveTargets(adminToken) {
    if (filterEmail) {
        const user = await lookupUserByEmail(adminToken, filterEmail);
        let verification = user?.verification || null;

        if (!verification) {
            verification = await findVerificationForEmail(adminToken, filterEmail);
        }

        if (!user && !verification) {
            return { targets: [], user: null, verification: null };
        }

        if (verification?.status === 'PENDING') {
            return {
                targets: [verification],
                user: user || { email: filterEmail, role: verification.user?.role },
                verification
            };
        }

        return { targets: [], user, verification };
    }

    const pending = await getPendingVerifications(adminToken);
    return { targets: pending, user: null, verification: null };
}

async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  Dev Tool — Approve Pending Verifications        ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`   API:   ${API_URL}`);
    console.log(`   Admin: ${ADMIN_EMAIL}`);
    if (filterEmail) console.log(`   Filter: ${filterEmail}`);
    if (listOnly) console.log('   Mode:  list pending queue');
    else if (dryRun) console.log('   Mode:  dry-run (no changes)');
    console.log('');

    let adminToken;
    try {
        adminToken = await getAdminToken();
        console.log('   🔑 Admin login OK\n');
    } catch (err) {
        console.error(`   ❌ Admin login failed: ${err.response?.data?.message || err.message}`);
        console.error('   Tip: ensure the server is running and admin account exists (Flow 01 / seed).');
        process.exit(1);
    }

    if (listOnly) {
        const pending = await getPendingVerifications(adminToken);
        if (pending.length === 0) {
            console.log('   ℹ️  Admin queue is empty (PENDING + document uploaded).\n');
            return;
        }
        console.log(`   ${pending.length} in admin queue:\n`);
        for (const v of pending) {
            console.log(`   • #${v.id} — ${v.user?.email || `userId ${v.userId}`} — ${v.documentUrl || 'no doc'}`);
        }
        console.log('');
        return;
    }

    const { targets, user, verification } = await resolveTargets(adminToken);

    if (filterEmail && targets.length === 0) {
        console.log('   ℹ️  No matching PENDING verifications.\n');
        printVerificationStatus(user, verification);
        console.log('');
        explainNoAction(user, verification);
        console.log('');
        console.log('   Debug: run with --list to see the admin queue, or submit docs in Profile Settings.');
        console.log('');
        return;
    }

    if (targets.length === 0) {
        console.log('   ℹ️  No PENDING verifications in admin queue.\n');
        console.log('   Tip: run with --list to inspect, or --email=you@example.com to check a specific account.');
        console.log('');
        return;
    }

    console.log(`   Found ${targets.length} PENDING verification(s):\n`);

    let ok = 0;
    let fail = 0;

    for (const v of targets) {
        const devEmail = v.user?.email || user?.email || '(unknown email)';
        console.log('──────────────────────────────────────────────────');
        console.log(`➡  Verification #${v.id} — userId ${v.userId} (${devEmail})`);

        if (dryRun) {
            console.log('   ⏭️  dry-run — would approve');
            ok++;
            continue;
        }

        try {
            await approve(v.id, adminToken);
            console.log('   ✅ APPROVED — developer isVerified: true');
            ok++;
        } catch (err) {
            console.error(`   ❌ FAILED: ${err.response?.data?.message || err.message}`);
            fail++;
        }
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ ${ok} ${dryRun ? 'matched' : 'approved'} | ❌ ${fail} failed ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');

    if (fail > 0) process.exit(1);
}

run().catch((e) => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
