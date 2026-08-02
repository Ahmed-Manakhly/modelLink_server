/**
 * FLOW 00 — Taxonomy Reset Script
 * Clears Category, Modality, BodyPart tables via direct Prisma.
 * Falls back to API if server is running.
 *
 * Usage: node seeding_scripts/00_taxonomy_categories_flow/reset.js
 */

const { PrismaClient } = require('@prisma/client');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();

const REFERENCE_PATH = path.join(__dirname, 'data_reference.json');
const INPUT_PATH     = path.join(__dirname, 'data_input.json');

async function reset() {
    console.log('♻️  FLOW 00 — Taxonomy Reset Starting...\n');

    // Subcategories first (parentId not null), then parents
    const subResult = await prisma.category.deleteMany({ where: { parentId: { not: null } } });
    console.log(`   ✅ Deleted ${subResult.count} subcategory record(s)`);

    const catResult = await prisma.category.deleteMany({ where: { parentId: null } });
    console.log(`   ✅ Deleted ${catResult.count} parent Category record(s)`);

    const modResult = await prisma.modality.deleteMany({});
    console.log(`   ✅ Deleted ${modResult.count} Modality record(s)`);

    const bpResult = await prisma.bodyPart.deleteMany({});
    console.log(`   ✅ Deleted ${bpResult.count} BodyPart record(s)`);

    // Reset data_input.json from reference
    if (fs.existsSync(REFERENCE_PATH)) {
        const ref = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
        fs.writeFileSync(INPUT_PATH, JSON.stringify(ref, null, 2));
        console.log('   ✅ data_input.json reset from data_reference.json');
    } else {
        console.log('   ⚠️  data_reference.json not found — data_input.json not reset');
    }

    console.log('\n✅ Flow 00 reset complete. Run bot.js to re-seed taxonomy.\n');
}

reset()
    .catch(e => { console.error('❌', e.message); process.exit(1); })
    .finally(() => prisma.$disconnect());
