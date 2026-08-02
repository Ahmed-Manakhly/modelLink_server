/**
 * FLOW 01 — Reset Script
 * Deletes only the actors defined in data_reference.json
 * then clears the session state and resets the input queue.
 *
 * Usage: node seeding_scripts/01_auth_profile_flow/reset.js
 */

const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH     = path.join(__dirname, 'data_input.json');
const SESSION_PATH   = path.join(__dirname, 'session_state.json');

async function reset() {
    console.log('♻️  FLOW 01 — Reset Starting...\n');

    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const allEmails = [
        ...ref.actors.clients.map(a => a.email),
        ...ref.actors.developers.map(a => a.email)
    ];

    console.log(`   Deleting ${allEmails.length} actor(s):`);
    allEmails.forEach(e => console.log(`   - ${e}`));

    // Cascade deletes all child records (Wallet, Verification, Orders, etc.)
    const result = await prisma.user.deleteMany({
        where: { email: { in: allEmails } }
    });
    console.log(`\n   ✅ Deleted ${result.count} user record(s) (cascade applied)`);

    // Clear session state
    fs.writeFileSync(SESSION_PATH, JSON.stringify({}, null, 2));
    console.log('   ✅ session_state.json cleared');

    // Reset input queue
    fs.writeFileSync(INPUT_PATH, '[]');
    console.log('   ✅ data_input.json cleared');

    console.log('\n✅ Flow 01 reset complete. Run bot.js to re-seed.\n');
}

reset()
    .catch(e => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
