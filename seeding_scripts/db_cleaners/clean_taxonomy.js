/** Clean ALL Taxonomy (Category, Modality, BodyPart) */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: Taxonomy tables (Category, Modality, BodyPart)...');
    // Models must be deleted first (categoryId is SetNull, so OK actually)
    const c = await prisma.category.deleteMany({});
    const m = await prisma.modality.deleteMany({});
    const b = await prisma.bodyPart.deleteMany({});
    console.log(`✅ Deleted ${c.count} Category/ies`);
    console.log(`   Deleted ${m.count} Modality/ies`);
    console.log(`   Deleted ${b.count} BodyPart(s)`);
    console.log('   (AiModel.categoryId and AiModelVersion.modalityId/bodyPartId set to null)');
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
