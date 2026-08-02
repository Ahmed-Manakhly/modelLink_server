/**
 * FLOW 07 — Admin Edge Cases: Soft-Delete & Restore
 * ============================================================
 * Scenario A: Admin soft-deletes "OphthAI Screener"
 *             → asserts model is invisible to public search
 *             → asserts client cannot create an order for it
 *
 * Scenario B: Admin restores "OphthAI Screener"
 *             → asserts model is visible in public search again
 *
 * Usage:
 *   node seeding_scripts/07_admin_edge_cases/bot.js
 * ============================================================
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL = process.env.API_URL || reference.env.API_URL;
const THROTTLE = reference.env.THROTTLE_MS || 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const authHeaders = (token) => ({ Authorization: `Bearer ${token}` });

async function login(email, password) {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    return res.data.token;
}

async function searchModels(search, token = null) {
    const params = new URLSearchParams({ search }).toString();
    const config = token ? { headers: authHeaders(token) } : {};
    const res = await axios.get(`${API_URL}/aiModel?${params}`, config);
    return res.data?.data?.models || res.data?.data?.aiModels || [];
}

async function findTargetModel(adminToken) {
    const models = await searchModels(reference.targetModel.title, adminToken);
    const match = models.find((m) => m.title === reference.targetModel.title);
    if (!match) {
        throw new Error(`Target model "${reference.targetModel.title}" not found — run Flow 03 first`);
    }
    return match;
}

async function runScenarioA(adminToken, clientToken, model) {
    console.log('\n── Scenario A: Soft-delete ──\n');

    const detailBefore = await axios.get(`${API_URL}/aiModel/${model.id}`, {
        headers: authHeaders(adminToken)
    });
    const deletedAt = detailBefore.data?.data?.model?.deletedAt ?? detailBefore.data?.data?.aiModel?.deletedAt;

    if (deletedAt) {
        console.log('   ⚠️  Model already soft-deleted — skipping Scenario A');
        return model;
    }

    await axios.delete(`${API_URL}/aiModel/${model.id}`, { headers: authHeaders(adminToken) });
    console.log(`   ✅ Model #${model.id} soft-deleted`);

    const publicResults = await searchModels(reference.targetModel.title);
    if (publicResults.some((m) => m.id === model.id)) {
        throw new Error('Soft-deleted model still visible in public search');
    }
    console.log('   ✅ Public search returns 0 matching results');

    const primaryVersion = model.versions?.find((v) => v.isPrimary) || model.versions?.[0];
    if (primaryVersion) {
        try {
            await axios.post(
                `${API_URL}/orders/create-payment-intent`,
                { aiModelId: model.id, versionId: primaryVersion.id },
                { headers: authHeaders(clientToken) }
            );
            throw new Error('Order attempt succeeded on deleted model — expected failure');
        } catch (err) {
            const status = err.response?.status;
            if (status !== 400 && status !== 404) {
                throw err;
            }
            console.log(`   ✅ Order attempt blocked (${status})`);
        }
    } else {
        console.log('   ⚠️  No version on list payload — skipping order-attempt assertion');
    }

    console.log('   ✅ Scenario A PASSED — model deleted and invisible');
    return model;
}

async function runScenarioB(adminToken, clientToken, model) {
    console.log('\n── Scenario B: Restore ──\n');

    await axios.patch(
        `${API_URL}/aiModel/${model.id}`,
        { restore: true },
        { headers: authHeaders(adminToken) }
    );
    console.log(`   ✅ Model #${model.id} restored via PATCH restore=true`);

    const publicResults = await searchModels(reference.targetModel.title);
    const restored = publicResults.find((m) => m.id === model.id);
    if (!restored) {
        throw new Error('Restored model not visible in public search');
    }
    console.log('   ✅ Public search returns 1 result');

    const detail = await axios.get(`${API_URL}/aiModel/${model.id}`, {
        headers: authHeaders(clientToken)
    });
    const aiModel = detail.data?.data?.model ?? detail.data?.data?.aiModel;
    if (aiModel.deletedAt !== null) {
        throw new Error('Model deletedAt is not null after restore');
    }
    console.log(`   ✅ Model state: status=${aiModel.status}, deletedAt=null`);
    console.log('   ✅ Scenario B PASSED — model restored and visible');
}

async function runScenarioC(adminToken) {
    console.log('\n── Scenario C: Feature Models ──\n');

    const titlesToFeature = reference.modelsToFeature || [];
    if (titlesToFeature.length === 0) {
        console.log('   ⚠️  No modelsToFeature specified in reference data — skipping Scenario C');
        return;
    }

    const idsToFeature = [];
    for (const title of titlesToFeature) {
        const models = await searchModels(title, adminToken);
        const match = models.find((m) => m.title === title);
        if (match) {
            idsToFeature.push(match.id);
        } else {
            console.log(`   ⚠️  Model "${title}" not found for featuring`);
        }
    }

    if (idsToFeature.length === 0) {
        console.log('   ⚠️  No matching models found to feature — skipping Scenario C');
        return;
    }

    await axios.patch(
        `${API_URL}/aiModel/bulk-status`,
        { ids: idsToFeature, featured: true },
        { headers: authHeaders(adminToken) }
    );
    console.log(`   ✅ ${idsToFeature.length} models featured successfully`);
    console.log('   ✅ Scenario C PASSED — models are now featured');
}

async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 07 — Admin Edge Cases Bot                  ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log(`   API: ${API_URL}\n`);

    const adminToken = await login(reference.admin.email, reference.admin.password);
    const clientToken = await login(reference.clientProbe.email, reference.clientProbe.password);

    const model = await findTargetModel(adminToken);
    console.log(`   🎯 Target: "${model.title}" (ID: ${model.id})`);

    await sleep(THROTTLE);
    const target = await runScenarioA(adminToken, clientToken, model);
    await sleep(THROTTLE);
    await runScenarioB(adminToken, clientToken, target);
    await sleep(THROTTLE);
    await runScenarioC(adminToken);

    console.log('\n🎉 Flow 07 complete.\n');
}

run().catch((e) => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
