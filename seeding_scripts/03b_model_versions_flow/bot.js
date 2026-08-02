/**
 * FLOW 03b — Model Versions Bot
 * ============================================================
 * Creates new versions for existing models owned by developers.
 *
 * Usage:
 *   node seeding_scripts/03b_model_versions_flow/bot.js
 * ============================================================
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const FLOW01_SESSION = path.join(__dirname, '..', '01_auth_profile_flow', 'session_state.json');

const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL = process.env.API_URL || reference.env.API_URL || 'https://www.modellink.manakhly.tech/api';
const THROTTLE = reference.env.THROTTLE_MS || 1000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 03b — Model Versions Bot                   ║');
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`   API: ${API_URL}\n`);

    const developers = reference.developers;

    for (const dev of developers) {
        console.log(`──────────────────────────────────────────────────`);
        console.log(`➡  Developer: ${dev.email}`);

        // 1. Login
        let token, userId;
        try {
            const res = await axios.post(`${API_URL}/auth/login`, {
                email: dev.email,
                password: dev.password
            });
            token = res.data.token;
            userId = res.data.data.user.id;
            console.log(`   🔑 Logged in successfully`);
        } catch (err) {
            console.error(`   ❌ Auth failed: ${err.response?.data?.message || err.message}`);
            continue;
        }

        // 2. Fetch Developer's Models
        let models = [];
        try {
            const res = await axios.get(`${API_URL}/aiModel/byUser/${userId}`);
            models = res.data.data.models || [];
        } catch (err) {
            console.error(`   ❌ Failed to fetch models: ${err.response?.data?.message || err.message}`);
            continue;
        }

        if (models.length === 0) {
            console.log(`   ⏭️  No models found for this developer. Skipping.`);
            continue;
        }

        // Pick the first model to add a version
        const model = models[0];
        console.log(`   📦 Found Model: "${model.title}" (ID: ${model.id})`);

        // Check existing versions to determine new version number
        const existingVersions = model.versions || [];
        const newVersionCode = `2.${existingVersions.length}.0`;

        // 3. Create a new version
        let newVersionId;
        try {
            const res = await axios.post(`${API_URL}/aiModel/${model.id}/versions`, {
                version: newVersionCode,
                price: 250 + (existingVersions.length * 50),
                isPrimary: false,
                isActive: true
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            newVersionId = res.data.data.version.id;
            console.log(`   ✅ Created Version ${newVersionCode} (ID: ${newVersionId})`);
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            if (msg.includes('already exists')) {
                console.log(`   ⏭️  Version ${newVersionCode} already exists. Skipping.`);
                continue;
            }
            console.error(`   ❌ Failed to create version: ${msg}`);
            continue;
        }

        await sleep(THROTTLE);

        // 4. Add Features
        try {
            await axios.post(`${API_URL}/aiModel/versions/${newVersionId}/features`, {
                feature: `Advanced Integration for ${newVersionCode}`
            }, { headers: { Authorization: `Bearer ${token}` } });

            await axios.post(`${API_URL}/aiModel/versions/${newVersionId}/features`, {
                feature: `Performance boost by 15%`
            }, { headers: { Authorization: `Bearer ${token}` } });
            console.log(`   ✅ Added Features`);
        } catch (err) {
            console.error(`   ❌ Failed to add features: ${err.response?.data?.message || err.message}`);
        }

        // 5. Add Metric
        try {
            await axios.post(`${API_URL}/aiModel/versions/${newVersionId}/metrics`, {
                metric: 'Accuracy (v2)',
                value: 98.5
            }, { headers: { Authorization: `Bearer ${token}` } });
            console.log(`   ✅ Added Metric`);
        } catch (err) {
            console.error(`   ❌ Failed to add metric: ${err.response?.data?.message || err.message}`);
        }

        // 6. Add Asset
        try {
            await axios.post(`${API_URL}/aiModel/versions/${newVersionId}/assets`, {
                type: 'API_ENDPOINT',
                value: `https://api.medai-seed.com/v2/endpoint-${newVersionId}`
            }, { headers: { Authorization: `Bearer ${token}` } });
            console.log(`   ✅ Added Asset`);
        } catch (err) {
            console.error(`   ❌ Failed to add asset: ${err.response?.data?.message || err.message}`);
        }

        await sleep(THROTTLE);
    }

    console.log('\n   🎉 Finished Model Versions Seeding Flow!\n');
}

run().catch(e => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
