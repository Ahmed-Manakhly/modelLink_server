/**
 * FLOW 03 — Model Publishing Bot
 * ============================================================
 * Refactored from seed_models_bot.js to follow the new
 * flow-based architecture with data_reference.json / data_input.json.
 *
 * What changed from the old bot:
 *  - Reads developers + models from data_reference.json
 *  - Assigns models to devs via _assignedTo field
 *  - On success: removes model from data_input.json queue
 *  - On crash: remaining queue is safe to resume
 *  - Session tokens read from Flow 01 session_state.json
 *
 * Usage:
 *   node seeding_scripts/03_model_publishing_flow/bot.js
 * ============================================================
 */

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const FormData = require('form-data');

// ── Paths ────────────────────────────────────────────────────
const REFERENCE_PATH  = path.join(__dirname, 'data_reference.json');
const INPUT_PATH      = path.join(__dirname, 'data_input.json');
const FLOW01_SESSION  = path.join(__dirname, '..', '01_auth_profile_flow', 'session_state.json');
const MODELS_DIR      = path.join(__dirname, '..', 'data', 'MODELS');
const FAIL_LOG_PATH   = path.join(__dirname, 'failed_models.json');

// ── Config ────────────────────────────────────────────────────
const reference   = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL     = process.env.API_URL || reference.env.API_URL;
const THROTTLE    = reference.env.THROTTLE_MS    || 1000;
const MAX_RETRIES = reference.env.MAX_RETRIES     || 2;
const RETRY_DELAYS = reference.env.RETRY_DELAYS_MS || [3000, 10000];

const DUMMY_PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function normalizeCategoryName(name) {
    return String(name || '').replace(/&/g, 'and').replace(/\s+/g, ' ').trim().toLowerCase();
}

async function resolveTaxonomyForModel(modelData) {
    const catRes = await axios.get(`${API_URL}/taxonomy/categories?limit=500`);
    const categories = catRes.data.data.categories || [];
    const target = normalizeCategoryName(modelData.category);
    const parent = categories.find(
        (c) => c.parentId === null && normalizeCategoryName(c.name) === target
    );
    if (!parent) {
        throw new Error(`Parent category not found: "${modelData.category}"`);
    }
    const subCats = categories.filter((c) => c.parentId === parent.id);
    if (!subCats.length) {
        throw new Error(`No subcategories under "${parent.name}"`);
    }
    const subTarget = normalizeCategoryName(modelData.subcategory);
    let sub = subCats.find((c) => normalizeCategoryName(c.name) === subTarget);
    if (!sub && subTarget) {
        sub = subCats.find((c) => normalizeCategoryName(c.name).includes(subTarget));
    }
    if (!sub) {
        throw new Error(
            `Subcategory "${modelData.subcategory}" not found under category "${parent.name}"`
        );
    }
    modelData.categoryId = sub.id;
    modelData.category = parent.name;

    if (modelData.modality) {
        const modRes = await axios.get(`${API_URL}/taxonomy/modalities?limit=500`);
        const mod = modRes.data.data.modalities.find(
            (m) => m.name.toUpperCase() === String(modelData.modality).toUpperCase()
        );
        if (mod) modelData.modalityId = mod.id;
    }
    if (modelData.bodyPart) {
        const bpRes = await axios.get(`${API_URL}/taxonomy/bodyparts?limit=500`);
        const bp = bpRes.data.data.bodyParts.find((b) => b.name === modelData.bodyPart);
        if (bp) modelData.bodyPartId = bp.id;
    }
}

// ── Queue management ─────────────────────────────────────────
function loadQueue() {
    if (!fs.existsSync(INPUT_PATH)) return null;
    const raw = fs.readFileSync(INPUT_PATH, 'utf8').trim();
    if (raw === '' || raw === '[]') return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.models && parsed.models.length === 0) return null;
        return parsed;
    } catch { return null; }
}

function initQueue() {
    console.log('♻️  data_input.json empty — copying from data_reference.json...\n');
    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const queue = {
        developers: [...ref.developers],
        models:     [...ref.models]
    };
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
    return queue;
}

function removeModelFromQueue(modelTitle) {
    const queue = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    queue.models = queue.models.filter(m => m.data.title !== modelTitle);
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
}

// ── Token resolution ─────────────────────────────────────────
async function getToken(dev) {
    if (fs.existsSync(FLOW01_SESSION)) {
        const session = JSON.parse(fs.readFileSync(FLOW01_SESSION, 'utf8'));
        if (session[dev.id]?.token) {
            return session[dev.id].token;
        }
    }
    const res = await axios.post(`${API_URL}/auth/login`, {
        email: dev.email, password: dev.password
    });
    return res.data.token;
}

// ── Cover image resolution ────────────────────────────────────
function resolveCover(coverFilename) {
    if (coverFilename) {
        const explicit = path.join(MODELS_DIR, coverFilename);
        if (fs.existsSync(explicit)) {
            return { stream: fs.createReadStream(explicit), filename: coverFilename };
        }
    }
    // Pick random from MODELS dir
    if (fs.existsSync(MODELS_DIR)) {
        const files = fs.readdirSync(MODELS_DIR).filter(f => f.match(/\.(png|jpe?g|jfif|webp)$/i));
        if (files.length > 0) {
            const f = files[Math.floor(Math.random() * files.length)];
            return { stream: fs.createReadStream(path.join(MODELS_DIR, f)), filename: f };
        }
    }
    return { stream: DUMMY_PNG, filename: 'fallback_cover.png' };
}

// ── Retry POST ────────────────────────────────────────────────
function isRetryable(err) {
    const msg = (err.response?.data?.message || err.message || '').toLowerCase();
    if (msg.includes('already exists') || msg.includes('unique')) return false;
    if ([400, 401, 403, 422].includes(err.response?.status)) return false;
    return true;
}

async function postWithRetry(form, token) {
    let lastErr = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) {
            const delay = RETRY_DELAYS[attempt - 1];
            process.stdout.write(`   🔄 Retry [${attempt}/${MAX_RETRIES}] in ${delay / 1000}s...`);
            await sleep(delay);
            console.log(' retrying');
        }
        try {
            const res = await axios.post(`${API_URL}/aiModel`, form, {
                headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
                timeout: 30000
            });
            return { success: true, id: res.data.data?.newAIModel?.id ?? res.data.data?.aiModel?.id ?? res.data.data?.model?.id };
        } catch (err) {
            lastErr = err;
            const msg = err.response?.data?.message || err.message;
            if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('unique')) {
                return { success: false, isSkippable: true, reason: msg };
            }
            if (!isRetryable(err)) return { success: false, isSkippable: false, reason: msg };
        }
    }
    return { success: false, isSkippable: false, reason: lastErr?.response?.data?.message || lastErr?.message };
}

// ── Main runner ───────────────────────────────────────────────
async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 03 — Model Publishing Bot                  ║');
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`   API: ${API_URL}\n`);

    let queue = loadQueue();
    if (!queue) queue = initQueue();

    // Build a token map per dev
    const tokenMap = {};
    for (const dev of queue.developers) {
        try {
            tokenMap[dev.id] = await getToken(dev);
            console.log(`   🔑 Token acquired: ${dev.id}`);
        } catch (err) {
            console.error(`   ❌ Auth failed for ${dev.id}: ${err.response?.data?.message || err.message}`);
        }
    }
    console.log();

    let ok = 0, skip = 0, fail = 0;
    const failed = [];

    for (const model of [...queue.models]) {
        const devId = model._assignedTo;
        const token = tokenMap[devId];
        const title = model.data.title;

        console.log(`──────────────────────────────────────────────────`);
        console.log(`➡  Model: "${title}"`);
        console.log(`   Assigned to: ${devId}`);

        if (!token) {
            console.error(`   ❌ No token for ${devId} — skipping`);
            fail++;
            failed.push(model);
            continue;
        }

        // Build form
        const form = new FormData();

        try {
            await resolveTaxonomyForModel(model.data);
        } catch (e) {
            console.error(`   ❌ Taxonomy mapping failed — ${e.message}`);
            fail++;
            failed.push(model);
            await sleep(THROTTLE);
            continue;
        }

        form.append('data', JSON.stringify(model.data));
        const cover = resolveCover(model.files?.cover);
        form.append('cover', cover.stream, { filename: cover.filename });
        console.log(`   🖼️  Cover: ${cover.filename}`);

        if (model.files?.gallery && Array.isArray(model.files.gallery)) {
            for (const galName of model.files.gallery) {
                const galFile = resolveCover(galName);
                form.append('gallery', galFile.stream, { filename: galFile.filename });
            }
            console.log(`   📸 Gallery: ${model.files.gallery.length} images`);
        }

        const result = await postWithRetry(form, token);

        if (result.success) {
            console.log(`   ✅ Created — Model ID: ${result.id}`);
            removeModelFromQueue(title);
            ok++;
        } else if (result.isSkippable) {
            console.warn(`   ⏭️  SKIPPED — already exists in DB`);
            removeModelFromQueue(title);
            skip++;
        } else {
            console.error(`   ❌ FAILED — ${result.reason}`);
            fail++;
            failed.push(model);
        }

        await sleep(THROTTLE);
    }

    // Write failed models log
    fs.writeFileSync(FAIL_LOG_PATH, JSON.stringify(failed, null, 2));

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ ${ok} created  |  ⏭️ ${skip} skipped  |  ❌ ${fail} failed   ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    if (failed.length > 0) {
        console.log(`\n   ⚠️  ${failed.length} failed model(s) logged → ${FAIL_LOG_PATH}`);
        console.log('   Re-run bot.js to retry (remaining in data_input.json)\n');
        process.exit(1);
    } else {
        console.log('\n   🎉 All models processed!\n');
    }
}

run().catch(e => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
