/**
 * One-time backfill: set pairKey on conversations missing it and merge duplicates.
 * Run: node scripts/backfill_conversation_pair_keys.js
 */
const prisma = require('../prisma/prisma');

function buildPairKey(userIds) {
  return [...userIds].sort().join('_');
}

async function main() {
  const conversations = await prisma.conversation.findMany({
    where: { deletedAt: null },
    include: {
      participants: { select: { userId: true } },
      _count: { select: { messages: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const groups = new Map();

  for (const conv of conversations) {
    const userIds = conv.participants.map((p) => p.userId);
    if (userIds.length !== 2) {
      console.warn(`Skipping conversation ${conv.id}: expected 2 participants, got ${userIds.length}`);
      continue;
    }
    const pairKey = buildPairKey(userIds);
    if (!groups.has(pairKey)) {
      groups.set(pairKey, []);
    }
    groups.get(pairKey).push(conv);
  }

  let backfilled = 0;
  let merged = 0;

  for (const [pairKey, group] of groups) {
    const canonical = group[0];
    const duplicates = group.slice(1);

    if (!canonical.pairKey) {
      await prisma.conversation.update({
        where: { id: canonical.id },
        data: { pairKey },
      });
      backfilled += 1;
    }

    for (const dup of duplicates) {
      await prisma.$transaction(async (tx) => {
        await tx.message.updateMany({
          where: { conversationId: dup.id },
          data: { conversationId: canonical.id },
        });

        for (const participant of dup.participants) {
          const existing = await tx.conversationParticipant.findUnique({
            where: {
              conversationId_userId: {
                conversationId: canonical.id,
                userId: participant.userId,
              },
            },
          });
          if (!existing) {
            await tx.conversationParticipant.create({
              data: {
                conversationId: canonical.id,
                userId: participant.userId,
                hasRead: true,
                isHidden: false,
              },
            });
          }
        }

        const dupLast = dup.lastMessage || '';
        const canonLast = canonical.lastMessage || '';
        if (dupLast && (!canonLast || new Date(dup.updatedAt) > new Date(canonical.updatedAt))) {
          await tx.conversation.update({
            where: { id: canonical.id },
            data: {
              lastMessage: dupLast,
              unReadMsg: Math.max(canonical.unReadMsg || 0, dup.unReadMsg || 0),
            },
          });
        }

        await tx.conversation.update({
          where: { id: dup.id },
          data: { deletedAt: new Date(), pairKey: null },
        });
      });
      merged += 1;
    }
  }

  console.log(`Backfill complete. pairKeys set: ${backfilled}, duplicates merged: ${merged}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
