/** Clean ALL Wallets + WalletTransactions + DeveloperPayouts */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: Wallet tables...');
    const wt = await prisma.walletTransaction.deleteMany({});
    const dp = await prisma.developerPayout.deleteMany({});
    const w  = await prisma.wallet.deleteMany({});
    console.log(`✅ Deleted ${wt.count} WalletTransaction(s)`);
    console.log(`   Deleted ${dp.count} DeveloperPayout(s)`);
    console.log(`   Deleted ${w.count} Wallet(s)`);
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
