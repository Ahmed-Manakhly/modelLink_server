/**
 * Recompute AiModel.avgRating from totalStars / reviewCount after review mutations.
 */
async function recalcAvgRating(aiModelId, tx) {
    const model = await tx.aiModel.findUnique({
        where: { id: aiModelId },
        select: { totalStars: true, reviewCount: true },
    });
    if (!model) return;

    const avgRating = model.reviewCount > 0 ? model.totalStars / model.reviewCount : 0;
    await tx.aiModel.update({
        where: { id: aiModelId },
        data: { avgRating },
    });
}

module.exports = recalcAvgRating;
