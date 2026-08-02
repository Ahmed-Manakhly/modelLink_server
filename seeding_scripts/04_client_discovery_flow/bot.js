/**
 * FLOW 04 — Client Discovery Bot (Search & Filter Test Battery)
 * ============================================================
 * Runs a battery of GET queries against the marketplace API
 * and reports which pass/fail with assertion results.
 *
 * READ-ONLY — does not write to DB.
 *
 * Usage:
 *   node seeding_scripts/04_client_discovery_flow/bot.js
 * ============================================================
 */

const axios = require('axios');
const fs    = require('fs');
const path  = require('path');

// ── Paths ────────────────────────────────────────────────────
const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const FLOW01_SESSION = path.join(__dirname, '..', '01_auth_profile_flow', 'session_state.json');

const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL   = process.env.API_URL || reference.env.API_URL;
const THROTTLE  = reference.env.THROTTLE_MS || 200;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Token resolution ─────────────────────────────────────────
async function getClientToken() {
    const { client } = reference;

    if (fs.existsSync(FLOW01_SESSION)) {
        const session = JSON.parse(fs.readFileSync(FLOW01_SESSION, 'utf8'));
        if (session[client.id]?.token) return session[client.id].token;
    }

    const res = await axios.post(`${API_URL}/auth/login`, {
        email: client.email, password: client.password
    });
    return res.data.token;
}

// ── Assert helpers ────────────────────────────────────────────
function runAssertions(assert, data) {
    const issues = [];

    if (assert.statusCode) {
        // statusCode checked by axios (throws on non-2xx)
    }

    // Get the result array — handle both paginated and flat responses
    const results = data?.data?.models || data?.data?.aiModels || data?.data?.categories ||
                    data?.data || [];

    const count = Array.isArray(results) ? results.length :
                  (typeof results === 'object' ? Object.keys(results).length : 0);

    if (assert.minResults !== undefined && count < assert.minResults) {
        issues.push(`Expected ≥${assert.minResults} results, got ${count}`);
    }

    if (assert.allMatch) {
        const { field, value } = assert.allMatch;
        const mismatches = Array.isArray(results)
            ? results.filter(r => r[field] !== value)
            : [];
        if (mismatches.length > 0) {
            issues.push(`${mismatches.length} result(s) don't match ${field}=${value}`);
        }
    }

    if (assert.hasKeys) {
        const responseData = data?.data || {};
        for (const key of assert.hasKeys) {
            if (!(key in responseData)) {
                issues.push(`Missing key in response: ${key}`);
            }
        }
    }

    return issues;
}

// ── Main runner ───────────────────────────────────────────────
async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 04 — Client Discovery Bot                  ║');
    console.log('║  (Read-Only — Search & Filter Test Battery)      ║');
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`   API: ${API_URL}\n`);

    let token = null;
    try {
        token = await getClientToken();
        console.log('   🔑 Client token acquired\n');
    } catch (e) {
        console.warn(`   ⚠️  No client token — running as anonymous (some endpoints may fail)\n`);
    }

    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    let pass = 0, fail = 0;
    const results = [];

    for (const query of reference.queries) {
        console.log(`──────────────────────────────────────────────────`);
        console.log(`🔍 [${query.id}] ${query.name}`);

        const params = new URLSearchParams(query.params).toString();
        const url = `${API_URL}${query.path}${params ? '?' + params : ''}`;
        console.log(`   GET ${url}`);

        try {
            const res = await axios.get(url, { headers, timeout: 15000 });
            const issues = runAssertions(query.assert, res.data);

            if (issues.length === 0) {
                console.log(`   ✅ PASS (HTTP ${res.status})`);
                pass++;
                results.push({ id: query.id, name: query.name, status: 'PASS' });
            } else {
                console.error(`   ❌ FAIL (HTTP ${res.status}):`);
                issues.forEach(i => console.error(`      - ${i}`));
                fail++;
                results.push({ id: query.id, name: query.name, status: 'FAIL', issues });
            }
        } catch (err) {
            const status = err.response?.status;
            const msg    = err.response?.data?.message || err.message;
            console.error(`   ❌ FAIL (HTTP ${status || 'N/A'}) — ${msg}`);
            fail++;
            results.push({ id: query.id, name: query.name, status: 'FAIL', error: msg });
        }

        await sleep(THROTTLE);
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ ${pass} passed  |  ❌ ${fail} failed                  ║`);
    console.log('╚══════════════════════════════════════════════════╝\n');

    if (fail > 0) {
        console.log('Failed queries:');
        results.filter(r => r.status === 'FAIL').forEach(r => {
            const detail = r.error || (r.issues || []).join('; ');
            console.log(`  ❌ [${r.id}] ${r.name}: ${detail}`);
        });
        console.log('\n💡 Check ApiFeaturesHelpersForAiModels.js for filter query builder logic\n');
        process.exit(1);
    }
}

run().catch(e => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
