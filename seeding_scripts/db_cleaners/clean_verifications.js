/** Clean ALL DeveloperVerifications + reset isVerified flags */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: DeveloperVerification table...');
    const r = await prisma.developerVerification.deleteMany({});
    console.log(`✅ Deleted ${r.count} DeveloperVerification(s)`);

    const u = await prisma.user.updateMany({
        where: { role: 'DEVELOPER' },
        data: { isVerified: false }
    });
    console.log(`   (${u.count} DEVELOPER user(s) set back to isVerified: false)`);
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
