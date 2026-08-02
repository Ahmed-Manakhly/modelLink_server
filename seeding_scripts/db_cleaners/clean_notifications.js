/** Clean ALL Notifications */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: Notification table...');
    const r = await prisma.notification.deleteMany({});
    console.log(`✅ Deleted ${r.count} Notification(s)`);
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
