/**
 * Clean ALL Conversations + Messages + Participants
 *
 * ⚠️  KNOWN SCHEMA NOTE:
 * Conversation has NO direct FK to User.
 * When a User is deleted, their ConversationParticipant and Message records
 * cascade-delete, BUT the Conversation record itself is LEFT ORPHANED.
 * This cleaner explicitly removes those orphaned conversations.
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Cleaning: Conversations, Messages, Participants...');

    // Messages and Participants cascade from Conversation
    const r = await prisma.conversation.deleteMany({});
    console.log(`✅ Deleted ${r.count} Conversation(s)`);
    console.log('   (Cascaded: Message, ConversationParticipant)');
}
main().catch(e => console.error('❌', e.message)).finally(() => prisma.$disconnect());
