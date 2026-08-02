/**
 * DB Cleaner — ALL TABLES (Full Wipe)
 * ⚠️  DANGER: This deletes EVERYTHING in ALL tables.
 *
 * Usage: node seeding_scripts/db_cleaners/clean_all.js
 * Usage: node seeding_scripts/db_cleaners/clean_all.js --confirm
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const confirmed = process.argv.includes('--confirm');

async function cleanAll() {
    if (!confirmed) {
        console.log('⚠️  WARNING: This will DELETE ALL DATA from ALL tables.\n');
        console.log('   Re-run with --confirm to proceed:\n');
        console.log('   node seeding_scripts/db_cleaners/clean_all.js --confirm\n');
        return;
    }

    console.log('🔥 FULL DB WIPE — starting (child tables first)...\n');

    // Leaf nodes first, then parents
    const steps = [
        ['WebhookEvent',             () => prisma.webhookEvent.deleteMany({})],
        ['AuditLog',                 () => prisma.auditLog.deleteMany({})],
        ['Notification',             () => prisma.notification.deleteMany({})],
        ['Review',                   () => prisma.review.deleteMany({})],
        ['Dispute',                  () => prisma.dispute.deleteMany({})],
        ['WalletTransaction',        () => prisma.walletTransaction.deleteMany({})],
        ['Transaction',              () => prisma.transaction.deleteMany({})],
        ['Order',                    () => prisma.order.deleteMany({})],
        ['DeveloperPayout',          () => prisma.developerPayout.deleteMany({})],
        ['Wallet',                   () => prisma.wallet.deleteMany({})],
        ['ModelAsset',               () => prisma.modelAsset.deleteMany({})],
        ['AiModelFeature',           () => prisma.aiModelFeature.deleteMany({})],
        ['AiModelMetric',            () => prisma.aiModelMetric.deleteMany({})],
        ['AiModelVersion',           () => prisma.aiModelVersion.deleteMany({})],
        ['AiModel',                  () => prisma.aiModel.deleteMany({})],
        ['DeveloperVerification',    () => prisma.developerVerification.deleteMany({})],
        ['Message',                  () => prisma.message.deleteMany({})],
        ['ConversationParticipant',  () => prisma.conversationParticipant.deleteMany({})],
        ['Conversation',             () => prisma.conversation.deleteMany({})],
        ['Category',                 () => prisma.category.deleteMany({})],
        ['Modality',                 () => prisma.modality.deleteMany({})],
        ['BodyPart',                 () => prisma.bodyPart.deleteMany({})],
        ['EmailToken',               () => prisma.emailToken.deleteMany({})],
        ['User',                     () => prisma.user.deleteMany({ where: { role: { not: 'ADMIN' } } })],
        // Keep SystemSettings — it has platform fee config
    ];

    for (const [table, fn] of steps) {
        try {
            const r = await fn();
            console.log(`   ✅ ${table.padEnd(24)} — deleted ${r.count} row(s)`);
        } catch (e) {
            console.error(`   ❌ ${table.padEnd(24)} — ${e.message}`);
        }
    }

    console.log('\n🔥 Full wipe complete.\n');
}

cleanAll()
    .catch(e => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
