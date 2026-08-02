/**
 * FLOW 03 — Reset Script
 * Deletes all models published by the seeded developers.
 * Then resets the data_input.json queue from the reference.
 *
 * Usage: node seeding_scripts/03_model_publishing_flow/reset.js
 */

const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH     = path.join(__dirname, 'data_input.json');
const FAIL_LOG_PATH  = path.join(__dirname, 'failed_models.json');

async function reset() {
    console.log('♻️  FLOW 03 — Reset Starting...\n');

    const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    const devEmails = ref.developers.map(d => d.email);

    const devs = await prisma.user.findMany({
        where: { email: { in: devEmails } },
        select: { id: true, email: true }
    });

    if (devs.length === 0) {
        console.log('   ℹ️  No matching developers in DB. Nothing to delete.');
    } else {
        const devIds = devs.map(d => d.id);
        devs.forEach(d => console.log(`   Developer: ${d.email}`));

        // Prisma cascade handles: AiModelVersion → AiModelFeature, AiModelMetric, ModelAsset
        const result = await prisma.aiModel.deleteMany({
            where: { developerId: { in: devIds } }
        });
        console.log(`\n   ✅ Deleted ${result.count} AiModel record(s) (cascade applied to versions, features, metrics, assets)`);

        // Reset model counters on wallet (totalEarnings won't change, no orders yet)
        // Nothing else to reset for this flow.
    }

    // Reset queue back to full reference
    const ref2 = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
    fs.writeFileSync(INPUT_PATH, JSON.stringify({
        developers: ref2.developers,
        models: ref2.models
    }, null, 2));
    console.log('   ✅ data_input.json reset from data_reference.json');

    // Clear fail log
    fs.writeFileSync(FAIL_LOG_PATH, '[]');
    console.log('   ✅ failed_models.json cleared');

    console.log('\n✅ Flow 03 reset complete. Run bot.js to re-publish models.\n');
}

reset()
    .catch(e => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
