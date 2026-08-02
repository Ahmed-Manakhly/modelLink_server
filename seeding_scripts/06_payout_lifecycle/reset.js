/**
 * Reset Flow 06 — Payout lifecycle seed data (all 3 developers)
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DEV_EMAILS = [
    'seed_dev_01@modellink.com',
    'seed_dev_02@modellink.com',
    'seed_dev_03@modellink.com'
];

async function run() {
    for (const devEmail of DEV_EMAILS) {
        const dev = await prisma.user.findUnique({ where: { email: devEmail } });
        if (!dev) {
            console.log(`Developer ${devEmail} not found — skipping`);
            continue;
        }

        const payouts = await prisma.developerPayout.findMany({ where: { userId: dev.id } });
        for (const payout of payouts) {
            await prisma.walletTransaction.deleteMany({ where: { payoutId: payout.id } });
        }
        await prisma.developerPayout.deleteMany({ where: { userId: dev.id } });
        console.log(`  Removed ${payouts.length} payout record(s) for ${devEmail}`);
    }
}

run()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
