/**
 * FLOW 01 — Auth & Profile Bot
 * ============================================================
 * Simulates: Registration → Login → Profile Completion
 * for all actors defined in data_reference.json
 *
 * Usage:
 *   node seeding_scripts/01_auth_profile_flow/bot.js
 *
 * On first run: copies data_reference.json → data_input.json
 * On success:   removes actor from data_input.json queue
 * On failure:   leaves actor in queue, continues to next
 * ============================================================
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// ── Paths ────────────────────────────────────────────────────
const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH = path.join(__dirname, 'data_input.json');
const SESSION_PATH = path.join(__dirname, 'session_state.json');

// ── Load config from reference ────────────────────────────────
const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
const API_URL = process.env.API_URL || reference.env.API_URL;
const THROTTLE = reference.env.THROTTLE_MS || 500;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Session state (holds tokens for downstream flows) ─────────
function loadSession() {
    if (fs.existsSync(SESSION_PATH)) {
        return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
    }
    return {};
}
function saveSession(state) {
    fs.writeFileSync(SESSION_PATH, JSON.stringify(state, null, 2));
}

// ── Queue management ─────────────────────────────────────────
function loadQueue() {
    if (!fs.existsSync(INPUT_PATH)) return null;
    const raw = fs.readFileSync(INPUT_PATH, 'utf8').trim();
    if (raw === '' || raw === '[]' || raw === '{}') return null;
    try {
        const parsed = JSON.parse(raw);
        const clients = parsed.actors?.clients || [];
        const developers = parsed.actors?.developers || [];
        if (clients.length === 0 && developers.length === 0) return null;
        return parsed;
    } catch { return null; }
}

function initQueue() {
    console.log('♻️  data_input.json empty or missing — copying from data_reference.json...\n');
    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const queue = {
        actors: {
            clients: [...ref.actors.clients],
            developers: [...ref.actors.developers]
        }
    };
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
    return queue;
}

function removeActorFromQueue(actorId, role) {
    const queue = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf8'));
    if (role === 'CLIENT') {
        queue.actors.clients = queue.actors.clients.filter(a => a.id !== actorId);
    } else {
        queue.actors.developers = queue.actors.developers.filter(a => a.id !== actorId);
    }
    fs.writeFileSync(INPUT_PATH, JSON.stringify(queue, null, 2));
}

// ── Core steps ────────────────────────────────────────────────
async function registerOrLogin(actor) {
    // Try login first
    try {
        const res = await axios.post(`${API_URL}/auth/login`, {
            email: actor.email,
            password: actor.password
        });
        const user = res.data.data.user;
        console.log(`   ✅ Already exists — logged in as ${user.org_username || user.email}`);
        return { token: res.data.token, user };
    } catch {
        // Not found → register
    }

    const payload = {
        email: actor.email,
        password: actor.password,
        passwordConfirm: actor.password,
        role: actor.role,
        org_username: actor.org_username,
    };
    if (actor.org_name) payload.org_name = actor.org_name;

    const res = await axios.post(`${API_URL}/auth/register`, payload);
    const user = res.data.data.user;
    console.log(`   ✅ Registered — ${user.org_username || user.email} (${user.role})`);
    return { token: res.data.token, user };
}

async function completeProfile(actor, token) {
    if (!actor.profile) return;

    const form = new FormData();
    const profileData = {
        first_name: actor.profile.first_name,
        last_name: actor.profile.last_name,
        country: actor.profile.country,
        org_name: actor.org_name,
        org_desc: actor.profile.org_desc,
        org_phone: actor.profile.org_phone,
    };
    form.append('data', JSON.stringify(profileData));

    // Attach logo if file exists
    if (actor.profile.logoFile) {
        const logoPath = path.join(__dirname, '..', actor.profile.logoFile);
        if (fs.existsSync(logoPath)) {
            form.append('avatar', fs.createReadStream(logoPath), {
                filename: path.basename(logoPath)
            });
        }
    }

    await axios.patch(`${API_URL}/users`, form, {
        headers: { ...form.getHeaders(), Authorization: `Bearer ${token}` }
    });
    console.log(`   ✅ Profile updated`);
}

// ── Main runner ───────────────────────────────────────────────
async function run() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  FLOW 01 — Auth & Profile Bot                    ║');
    console.log(`╚══════════════════════════════════════════════════╝`);
    console.log(`   API: ${API_URL}\n`);

    let queue = loadQueue();
    if (!queue) queue = initQueue();

    const session = loadSession();
    let ok = 0, fail = 0;

    const allActors = [
        ...queue.actors.clients.map(a => ({ ...a, role: 'CLIENT' })),
        ...queue.actors.developers.map(a => ({ ...a, role: 'DEVELOPER' }))
    ];

    for (const actor of allActors) {
        console.log(`──────────────────────────────────────────────────`);
        console.log(`➡  Actor: ${actor.id} (${actor.role}) — ${actor.email}`);
        try {
            const { token, user } = await registerOrLogin(actor);
            await completeProfile(actor, token);

            // Save to session for downstream flows
            session[actor.id] = { token, userId: user.id, role: user.role, email: actor.email };
            saveSession(session);

            removeActorFromQueue(actor.id, actor.role);
            ok++;
        } catch (err) {
            const msg = err.response?.data?.message || err.message;
            console.error(`   ❌ FAILED: ${msg}`);
            fail++;
        }
        await sleep(THROTTLE);
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║  ✅ ${ok} succeeded  |  ❌ ${fail} failed               ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    if (ok > 0) {
        console.log(`\n📁 Session tokens saved → ${SESSION_PATH}`);
        console.log('   (Flow 02 bot will read these automatically)\n');
    }
}

run().catch(e => {
    console.error('❌ CRITICAL:', e.response?.data || e.message);
    process.exit(1);
});
