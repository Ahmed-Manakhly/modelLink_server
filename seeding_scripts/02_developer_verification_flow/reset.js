/**
 * FLOW 02 — Reset Script
 * Resets verification status for all seeded developers.
 * Does NOT delete the user — only resets verification + wallet.
 *
 * Usage: node seeding_scripts/02_developer_verification_flow/reset.js
 */

const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH     = path.join(__dirname, 'data_input.json');

async function reset() {
    console.log('♻️  FLOW 02 — Reset Starting...\n');

    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const devEmails = ref.developers.map(d => d.email);

    const devs = await prisma.user.findMany({
        where: { email: { in: devEmails } },
        select: { id: true, email: true }
    });

    if (devs.length === 0) {
        console.log('   ℹ️  No matching developers found in DB. Nothing to reset.');
        return;
    }

    const devIds = devs.map(d => d.id);
    devs.forEach(d => console.log(`   - ${d.email}`));

    // Delete verification records
    const vDel = await prisma.developerVerification.deleteMany({
        where: { userId: { in: devIds } }
    });
    console.log(`\n   ✅ Deleted ${vDel.count} DeveloperVerification record(s)`);

    // Delete wallets (and their wallet transactions via cascade)
    const wDel = await prisma.wallet.deleteMany({
        where: { userId: { in: devIds } }
    });
    console.log(`   ✅ Deleted ${wDel.count} Wallet record(s)`);

    // Clear approval notifications
    const nDel = await prisma.notification.deleteMany({
        where: { recipientId: { in: devIds }, senderId: null }
    });
    console.log(`   ✅ Deleted ${nDel.count} system Notification(s)`);

    // Reset isVerified flag
    await prisma.user.updateMany({
        where: { id: { in: devIds } },
        data: { isVerified: false }
    });
    console.log(`   ✅ isVerified set back to false for ${devIds.length} developer(s)`);

    // Reset queue
    fs.writeFileSync(INPUT_PATH, '[]');
    console.log('   ✅ data_input.json cleared');

    console.log('\n✅ Flow 02 reset complete. Run bot.js to re-run verification.\n');
}

reset()
    .catch(e => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
