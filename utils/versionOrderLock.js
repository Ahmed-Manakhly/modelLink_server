const prisma = require('../prisma/prisma');

const PAID_ORDER_STATUSES = ['PAID', 'DELIVERED'];

async function versionHasPaidOrders(versionId, client = prisma) {
    const count = await client.order.count({
        where: {
            versionId,
            status: { in: PAID_ORDER_STATUSES },
        },
    });
    return count > 0;
}

async function getPaidOrderFlagsByVersionIds(versionIds, client = prisma) {
    const flags = new Map();
    if (!Array.isArray(versionIds) || versionIds.length === 0) {
        return flags;
    }

    const rows = await client.order.groupBy({
        by: ['versionId'],
        where: {
            versionId: { in: versionIds },
            status: { in: PAID_ORDER_STATUSES },
        },
        _count: { id: true },
    });

    rows.forEach((row) => {
        flags.set(row.versionId, row._count.id > 0);
    });
    return flags;
}

module.exports = {
    PAID_ORDER_STATUSES,
    versionHasPaidOrders,
    getPaidOrderFlagsByVersionIds,
};
