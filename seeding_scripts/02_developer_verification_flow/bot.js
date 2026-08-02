/**
 * FLOW 02 — Developer Verification Bot
 * ============================================================
 * Real-world simulation: Developer submits verification docs.
 * Status will be PENDING until Admin approves via admin_approve.js
 * (run that script as the next step after this one).
 *
 * Usage:
 *   node seeding_scripts/02_developer_verification_flow/bot.js
 * ============================================================
 */

const axios    = require('axios');
const fs       = require('fs');
const path     = require('path');
const FormData = require('form-data');

// ── Paths ────────────────────────────────────────────────────
const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH     = path.join(__dirname, 'data_input.json');
const FLOW01_SESSION = path.join(__dirname, '..', '01_auth_profile_flow', 'session_state.json');

// ── Load config ───────────────────────────────────────────────
const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL   = process.env.API_URL || reference.env.API_URL;

// ── Session: get token from Flow 01 or login fresh ───────────
async function getToken(dev) {
    if (fs.existsSync(FLOW01_SESSION)) {
        const session = JSON.parse(fs.readFileSync(FLOW01_SESSION, 'utf8'));
        if (session[dev.id]?.token) {
            return { token: session[dev.id].token };
        }
    }
    const res = await axios.post(`${API_URL}/auth/login`, {
        email: dev.email, password: dev.password
    });
    return { token: res.data.token };
}

// ── Queue management ─────────────────────────────────────────
function loadQueue() {
    if (!fs.existsSync(INPUT_PATH)) return null;
    const raw = fs.readFileSync(INPUT_PATH, 'utf8').trim();
    if (raw === '' || raw === '[]' || raw === '{}') return null;
    try {
        const parsed = JSON.parse(raw);
        if (parsed.developers && parsed.developers.length === 0) return null;
        return parsed;
    } catch { return null; }
}

function initQueue() {
    console.log('♻️  data_input.json empty — copying from data_reference.json...\n');
    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const queue = { developers: [...ref.developers] };
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
    return queue;
}

function removeDevFromQueue(devId) {
    const queue = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    queue.developers = queue.developers.filter(d => d.id !== devId);
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
}

// ── Submit verification document ──────────────────────────────
async function submitVerification(dev, token) {
    const form = new FormData();
    form.append('data', JSON.stringify({ notes: dev.verification.notes }));

    const docPath = path.join(__dirname, '..', dev.verification.documentFile);
    if (fs.existsSync(docPath)) {
        form.append('document', fs.createReadStream(docPath), {
            filename: path.basename(docPath)
        });
        console.log(`   📄 Attaching document: ${path.basename(docPath)}`);
    } else {
        const DUMMY = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
        );
        form.append('document', DUMMY, { filename: 'placeholder_doc.png' });
        console.log(`   ⚠️  Document file not found, using placeholder PNG`);
    }

    const res = await axios.post(`${API_URL}/verifications/submit`, form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` }
    });
    return res.data.data.verification;
}

async function checkStatus(token) {
    const res = await axios.get(`${API_URL}/verifications/me`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.data.data?.verification || null;
}

// ── Main runner ───────────────────────────────────────────────
async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 02 — Developer Verification Bot            ║');
    console.log('║  (Submit docs only — Admin approves separately)  ║');
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`   API: ${API_URL}\n`);

    let queue = loadQueue();
    if (!queue) queue = initQueue();

    let ok = 0, fail = 0;

    for (const dev of queue.developers) {
        console.log(`──────────────────────────────────────────────────`);
        console.log(`➡  Developer: ${dev.id} (${dev.email})`);

        try {
            const { token } = await getToken(dev);

            // Check if already submitted or approved
            const existing = await checkStatus(token);
            if (existing?.status === 'APPROVED') {
                console.log(`   ⏭️  Already APPROVED — skipping`);
                removeDevFromQueue(dev.id);
                ok++;
                continue;
            }
            if (existing?.status === 'PENDING') {
                console.log(`   ⏭️  Already PENDING — docs already submitted`);
                removeDevFromQueue(dev.id);
                ok++;
                continue;
            }

            // Submit verification document
            console.log(`   📤 Submitting verification document...`);
            const verification = await submitVerification(dev, token);
            console.log(`   ✅ Document submitted — status: ${verification.status}`);
            console.log(`   ⏳ Awaiting Admin approval`);

            removeDevFromQueue(dev.id);
            ok++;
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.error(`   ❌ FAILED: ${msg}`);
            fail++;
        }
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ ${ok} submitted  |  ❌ ${fail} failed               ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('\n💡 Next step: Run admin approval bot to approve pending devs:');
    console.log('   node seeding_scripts/02_developer_verification_flow/admin_approve.js\n');
}

run().catch(e => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
