/** Clean ALL Users (cascades everything) */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: User table (cascade to all child records)...');
    // Orphaned Conversations won't cascade — clean them first
    await prisma.conversation.deleteMany({});
    const r = await prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } });
    console.log(`✅ Deleted ${r.count} User(s) + all cascaded child records`);
    console.log('   (Wallet, Verification, Orders, Notifications, Messages, ConversationParticipants)');
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
