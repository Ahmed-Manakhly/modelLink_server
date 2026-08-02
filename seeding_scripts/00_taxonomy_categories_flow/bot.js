/**
 * FLOW 00 — Taxonomy & Categories Seeding Bot
 * Uses real admin API + multipart icon upload (same as production).
 *
 * Usage: node seeding_scripts/00_taxonomy_categories_flow/bot.js
 */

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const FormData = require('form-data');

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH     = path.join(__dirname, 'data_input.json');
const CATEGORIES_DIR = path.join(__dirname, '..', 'data', 'CATEGORIES');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function loadQueue() {
    if (!fs.existsSync(INPUT_PATH)) return null;
    const raw = fs.readFileSync(INPUT_PATH, 'utf8').trim();
    if (raw === '' || raw === '[]') return null;
    try { return JSON.parse(raw); } catch { return null; }
}

function initQueue() {
    console.log('♻️  data_input.json empty — copying from data_reference.json...\n');
    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    fs.writeFileSync(INPUT_PATH, JSON.stringify(ref, null, 2));
    return ref;
}

function markCategoryDone(name) {
    const queue = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    queue.categories = queue.categories.filter(c => c.name !== name);
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
}

function markModalityDone(name) {
    const queue = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    queue.modalities = queue.modalities.filter(m => m.name !== name);
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
}

function markBodyPartDone(name) {
    const queue = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    queue.bodyParts = queue.bodyParts.filter(b => b.name !== name);
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
}

async function getAdminToken(admin) {
    const res = await axios.post(`${API_URL}/auth/login`, {
        email: admin.email,
        password: admin.password
    });
    return res.data.token;
}

function isRetryable(err) {
    const msg = (err.response?.data?.message || err.message || '').toLowerCase();
    if (msg.includes('already exists') || msg.includes('unique')) return false;
    if ([400, 401, 403, 422].includes(err.response?.status)) return false;
    return true;
}

async function postJsonWithRetry(url, data, token) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
        try {
            const res = await axios.post(url, data, {
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                timeout: 30000
            });
            return { success: true, data: res.data.data };
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('unique')) {
                return { success: false, isSkippable: true, reason: msg };
            }
            if (!isRetryable(err)) return { success: false, isSkippable: false, reason: msg };
        }
    }
    return { success: false, isSkippable: false, reason: 'Max retries exceeded' };
}

async function postCategoryWithIcon(url, payload, imageFilename, token) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (attempt > 0) await sleep(RETRY_DELAYS[attempt - 1]);
        try {
            const form = new FormData();
            form.append('data', JSON.stringify(payload));
            if (imageFilename) {
                const src = path.join(CATEGORIES_DIR, imageFilename);
                if (fs.existsSync(src)) {
                    form.append('icon', fs.createReadStream(src), imageFilename);
                } else {
                    console.log(`   ⚠️  Icon not found: ${imageFilename}`);
                }
            }
            const res = await axios.post(url, form, {
                headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` },
                timeout: 60000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
            });
            return { success: true, data: res.data.data };
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('unique')) {
                return { success: false, isSkippable: true, reason: msg };
            }
            if (!isRetryable(err)) return { success: false, isSkippable: false, reason: msg };
        }
    }
    return { success: false, isSkippable: false, reason: 'Max retries exceeded' };
}

async function linkSubcategory(sub, parentId, token) {
    const subResult = await postJsonWithRetry(
        `${API_URL}/taxonomy/categories`,
        { name: sub.name, slug: sub.slug, parentId },
        token
    );
    if (subResult.success) return subResult;
    if (!subResult.isSkippable) return subResult;

    const existing = await axios.get(`${API_URL}/taxonomy/categories`, {
        params: { subcategoriesOnly: 'true', limit: 500 }
    }).then(r => r.data.data.categories.find(c => c.slug === sub.slug)).catch(() => null);

    if (existing && existing.parentId !== parentId) {
        await axios.patch(
            `${API_URL}/taxonomy/categories/${existing.id}`,
            { parentId },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        return { success: true, data: { category: existing }, linked: true };
    }
    return subResult;
}

async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 00 — Taxonomy & Categories Seeding Bot    ║');
    console.log('╚══════════════════════════════════════════════════╝');

    const ref = loadQueue() || initQueue();
    const { env, admin, categories, modalities, bodyParts } = ref;

    global.API_URL      = env.API_URL;
    global.MAX_RETRIES  = env.MAX_RETRIES;
    global.RETRY_DELAYS = env.RETRY_DELAYS_MS;

    console.log(`   API: ${API_URL}\n`);

    const token = await getAdminToken(admin);
    console.log('   ✅ Admin token acquired\n');

    console.log('📂 Seeding Categories (multipart upload)...\n');
    let catOk = 0, catSkip = 0, catFail = 0;

    for (const cat of [...(categories || [])]) {
        console.log(`➡  Category: "${cat.name}"`);
        const parentResult = await postCategoryWithIcon(
            `${API_URL}/taxonomy/categories`,
            { name: cat.name, slug: cat.slug },
            cat.image,
            token
        );

        let parentId = parentResult.data?.category?.id;

        if (parentResult.success) {
            parentId = parentResult.data.category.id;
            console.log(`   ✅ Created — ID: ${parentId}`);
            markCategoryDone(cat.name);
            catOk++;
        } else if (parentResult.isSkippable) {
            const existing = await axios.get(`${API_URL}/taxonomy/categories`, {
                params: { parentId: 'null', limit: 100 }
            }).then(r => r.data.data.categories.find(c => c.name === cat.name)).catch(() => null);
            parentId = existing?.id;
            console.log(`   ⏭️  SKIPPED parent — ${parentResult.reason}`);
            markCategoryDone(cat.name);
            catSkip++;
        } else {
            console.log(`   ❌ Failed — ${parentResult.reason}`);
            catFail++;
            await sleep(env.THROTTLE_MS);
            continue;
        }

        if (parentId && cat.subcategories?.length) {
            for (const sub of cat.subcategories) {
                console.log(`   └─ Subcategory: "${sub.name}"`);
                const subResult = await linkSubcategory(sub, parentId, token);
                if (subResult.success) {
                    console.log(`      ✅ ${subResult.linked ? 'Linked' : 'Created'} — ID: ${subResult.data.category.id}`);
                } else if (subResult.isSkippable) {
                    console.log(`      ⏭️  SKIPPED — ${subResult.reason}`);
                } else {
                    console.log(`      ❌ Failed — ${subResult.reason}`);
                }
                await sleep(env.THROTTLE_MS);
            }
        }
        await sleep(env.THROTTLE_MS);
    }

    console.log('\n🔬 Seeding Modalities...\n');
    let modOk = 0, modSkip = 0, modFail = 0;
    for (const mod of [...(modalities || [])]) {
        const result = await postJsonWithRetry(`${API_URL}/taxonomy/modalities`, { name: mod.name, slug: mod.slug }, token);
        if (result.success) { modOk++; markModalityDone(mod.name); console.log(`   ✅ ${mod.name}`); }
        else if (result.isSkippable) { modSkip++; markModalityDone(mod.name); console.log(`   ⏭️  ${mod.name}`); }
        else { modFail++; console.log(`   ❌ ${mod.name} — ${result.reason}`); }
        await sleep(env.THROTTLE_MS);
    }

    console.log('\n🫀 Seeding Body Parts...\n');
    let bpOk = 0, bpSkip = 0, bpFail = 0;
    for (const bp of [...(bodyParts || [])]) {
        const result = await postJsonWithRetry(`${API_URL}/taxonomy/bodyparts`, { name: bp.name, slug: bp.slug }, token);
        if (result.success) { bpOk++; markBodyPartDone(bp.name); console.log(`   ✅ ${bp.name}`); }
        else if (result.isSkippable) { bpSkip++; markBodyPartDone(bp.name); console.log(`   ⏭️  ${bp.name}`); }
        else { bpFail++; console.log(`   ❌ ${bp.name} — ${result.reason}`); }
        await sleep(env.THROTTLE_MS);
    }

    console.log('\n✅ Flow 00 complete.\n');
    if (catFail || modFail || bpFail) process.exit(1);
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
