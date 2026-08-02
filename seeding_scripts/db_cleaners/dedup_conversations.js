/**
 * dedup_conversations.js
 *
 * One-off cleanup script required before running `npx prisma db push` with the
 * new `pairKey @unique` constraint on `Conversation`.
 *
 * What it does:
 *  1. Loads every conversation that has exactly 2 participants.
 *  2. Groups them by their sorted pairKey (`${[idA,idB].sort().join('_')}`).
 *  3. For each group with duplicates:
 *      a. Keeps the oldest conversation (lowest id) as the survivor.
 *      b. Re-parents all messages from the newer conversations to the survivor.
 *      c. Merges unReadMsg (takes the max per-group so nothing is lost).
 *      d. Deletes the duplicate ConversationParticipant rows for the extras
 *         (survivor already has the right participants).
 *      e. Deletes the duplicate Conversation rows.
 *      f. Backfills pairKey on the survivor.
 *  4. Backfills pairKey on all remaining 2-person conversations that don't have
 *     one yet (i.e. legitimate unique pairs created before this field existed).
 *
 * Usage (run BEFORE `npx prisma db push`):
 *   node seeding_scripts/db_cleaners/dedup_conversations.js
 *
 * Safe to re-run: rows that already have a pairKey are skipped.
 */

const prisma = require('../../prisma/prisma');

async function main() {
    console.log('=== dedup_conversations: start ===\n');

    // --- 1. Load all 2-participant conversations ---
    const conversations = await prisma.conversation.findMany({
        include: {
            participants: { select: { userId: true } },
            _count: { select: { messages: true } },
        },
        orderBy: { id: 'asc' },
    });

    const dmConversations = conversations.filter(c => c.participants.length === 2);
    console.log(`Total conversations: ${conversations.length}`);
    console.log(`2-participant (DM) conversations: ${dmConversations.length}`);

    // --- 2. Group by sorted pairKey ---
    const groups = new Map(); // pairKey → conversation[]
    for (const conv of dmConversations) {
        const [a, b] = conv.participants.map(p => p.userId).sort();
        const key = `${a}_${b}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(conv);
    }

    const duplicateGroups = [...groups.entries()].filter(([, convs]) => convs.length > 1);
    console.log(`Duplicate pairs found: ${duplicateGroups.length}\n`);

    // --- 3. Merge duplicates ---
    let mergedCount = 0;
    for (const [pairKey, convs] of duplicateGroups) {
        // oldest = lowest id (already sorted asc)
        const [survivor, ...extras] = convs;
        const extraIds = extras.map(c => c.id);
        const maxUnread = Math.max(...convs.map(c => c.unReadMsg ?? 0));

        console.log(
            `Merging pairKey=${pairKey}: keeping id=${survivor.id}, ` +
            `deleting ids=[${extraIds.join(', ')}] ` +
            `(${extras.reduce((s, c) => s + c._count.messages, 0)} messages to re-parent)`
        );

        await prisma.$transaction([
            // Re-parent messages from extras to survivor
            prisma.message.updateMany({
                where: { conversationId: { in: extraIds } },
                data: { conversationId: survivor.id },
            }),

            // Carry forward the highest unread count
            prisma.conversation.update({
                where: { id: survivor.id },
                data: { unReadMsg: maxUnread },
            }),

            // Delete participant rows of extras (messages already moved)
            prisma.conversationParticipant.deleteMany({
                where: { conversationId: { in: extraIds } },
            }),

            // Delete the duplicate conversation rows
            prisma.conversation.deleteMany({
                where: { id: { in: extraIds } },
            }),
        ]);

        // Backfill pairKey on survivor (outside transaction so it runs after deletes)
        await prisma.conversation.update({
            where: { id: survivor.id },
            data: { pairKey },
        });

        mergedCount += extraIds.length;
    }

    console.log(`\nDuplicates removed: ${mergedCount}`);

    // --- 4. Backfill pairKey on unique pairs that don't have one yet ---
    const remaining = await prisma.conversation.findMany({
        where: { pairKey: null },
        include: { participants: { select: { userId: true } } },
    });

    let backfilledCount = 0;
    for (const conv of remaining) {
        if (conv.participants.length !== 2) continue; // skip non-DM rows
        const [a, b] = conv.participants.map(p => p.userId).sort();
        const key = `${a}_${b}`;
        await prisma.conversation.update({
            where: { id: conv.id },
            data: { pairKey: key },
        });
        backfilledCount++;
    }

    console.log(`pairKey backfilled on: ${backfilledCount} conversations`);
    console.log('\n=== dedup_conversations: done ===');
    console.log('You can now safely run: npx prisma db push');
}

main()
    .catch(err => {
        console.error('FATAL:', err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
