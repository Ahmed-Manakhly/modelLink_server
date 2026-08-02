/** Clean ALL AiModels (cascades versions, features, metrics, assets) */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: AiModel table...');
    const r = await prisma.aiModel.deleteMany({});
    console.log(`✅ Deleted ${r.count} AiModel(s)`);
    console.log('   (Cascaded: AiModelVersion, AiModelFeature, AiModelMetric, ModelAsset)');
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
