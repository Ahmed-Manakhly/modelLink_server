/**
 * FLOW 05 — Reset Script
 * Deletes orders, transactions, reviews, and resets wallet balances
 * for all actors referenced in data_reference.json orders.
 *
 * Usage: node seeding_scripts/05_order_transaction_flow/reset.js
 */

const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH     = path.join(__dirname, 'data_input.json');

async function reset() {
    console.log('♻️  FLOW 05 — Reset Starting...\n');

    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const buyerKeys = [...new Set((ref.orders || []).map((o) => o.buyer))];
    const devKeys = [...new Set((ref.orders || []).map((o) => o.developer))];
    const clientEmails = buyerKeys.map((k) => ref.actors?.[k]?.email).filter(Boolean);
    const devEmails = devKeys.map((k) => ref.actors?.[k]?.email).filter(Boolean);

    let totalOrdersDeleted = 0;

    for (const email of clientEmails) {
        const clientUser = await prisma.user.findUnique({
            where: { email }, select: { id: true }
        });
        if (!clientUser) {
            console.log(`   ℹ️  Client not found: ${email}`);
            continue;
        }

        const orders = await prisma.order.findMany({
            where: { clientId: clientUser.id },
            select: { id: true }
        });
        const orderIds = orders.map((o) => o.id);
        console.log(`   Found ${orderIds.length} order(s) for ${email}`);

        if (orderIds.length === 0) continue;

        await prisma.review.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
        totalOrdersDeleted += orderIds.length;
    }

    if (totalOrdersDeleted > 0) {
        console.log(`   ✅ Deleted ${totalOrdersDeleted} Order(s) (cascade children)`);
    }

    for (const email of devEmails) {
        const devUser = await prisma.user.findUnique({
            where: { email }, select: { id: true }
        });
        if (!devUser) {
            console.log(`   ℹ️  Developer not found: ${email}`);
            continue;
        }

        await prisma.aiModel.updateMany({
            where: { developerId: devUser.id },
            data: { sales: 0, totalStars: 0, starFrequency: 0, reviewCount: 0 }
        });
        await prisma.wallet.updateMany({
            where: { userId: devUser.id },
            data: { availableBalance: 0, totalEarnings: 0, pendingBalance: 0 }
        });
        console.log(`   ✅ Counters + wallet reset for ${email}`);
    }

    fs.writeFileSync(INPUT_PATH, '[]');
    console.log('   ✅ data_input.json cleared');

    console.log('\n✅ Flow 05 reset complete. Run bot.js to re-run orders.\n');
}

reset()
    .catch(e => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
