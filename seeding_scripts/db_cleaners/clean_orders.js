/** Clean ALL Orders (cascades Transactions, WalletTransactions, Reviews, Disputes) */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: Order table + financial records...');
    // WalletTransaction.orderId is SetNull not Cascade — delete manually first
    await prisma.walletTransaction.deleteMany({});
    const r = await prisma.order.deleteMany({});
    console.log(`✅ Deleted ${r.count} Order(s)`);
    console.log('   (Cascaded: Transaction, Review, Dispute)');
    console.log('   (Also cleared: WalletTransaction)');

    // Reset model counters
    await prisma.aiModel.updateMany({ data: { sales: 0, totalStars: 0, starFrequency: 0, reviewCount: 0 } });
    console.log('   (AiModel counters reset to 0)');
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
