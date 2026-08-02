/** Clean ALL Reviews + reset AiModel star counters */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: Review table...');
    const r = await prisma.review.deleteMany({});
    console.log(`✅ Deleted ${r.count} Review(s)`);

    await prisma.aiModel.updateMany({ data: { totalStars: 0, starFrequency: 0, reviewCount: 0 } });
    console.log('   (AiModel.totalStars, starFrequency, reviewCount reset to 0)');
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
