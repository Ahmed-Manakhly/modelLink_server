/**
 * FLOW 07 — Reset Script
 * Ensures "OphthAI Screener" is restored (deletedAt = null, status = PUBLISHED).
 * Safe to run after a partial or failed bot run.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function reset() {
    const unfeatured = await prisma.aiModel.updateMany({
        where: { featured: true },
        data: { featured: false }
    });
    console.log(`✅ ${unfeatured.count} models un-featured`);

    const dev = await prisma.user.findUnique({ where: { email: 'seed_dev_01@modellink.com' } });
    if (!dev) {
        console.log('Developer not found — nothing to reset');
        return;
    }

    const model = await prisma.aiModel.findFirst({
        where: { title: 'OphthAI Screener', developerId: dev.id }
    });
    if (!model) {
        console.log('OphthAI Screener not found — nothing to reset');
        return;
    }

    await prisma.aiModel.update({
        where: { id: model.id },
        data: { deletedAt: null, status: 'PUBLISHED' }
    });
    console.log(`✅ OphthAI Screener (id: ${model.id}) restored to PUBLISHED`);
}

reset()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
