const prisma = require('../prisma/prisma');

let cachedFee = null;
let cacheExpires = 0;

module.exports = async function getPlatformFee() {
    const now = Date.now();
    if (cachedFee !== null && now < cacheExpires) {
        return cachedFee;
    }
    try {
        const settings = await prisma.systemSettings.findFirst({
            where: { id: 1 }
        });
        cachedFee = settings?.platformFeeValue ?? 20;
    } catch (err) {
        cachedFee = 20; // Default fallback on DB error
    }
    cacheExpires = now + 60000; // Cache for 1 minute
    return cachedFee;
};
