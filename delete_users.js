const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteUsers() {
    try {
        // You can pass an argument to delete a specific user by email:
        // node delete_users.js test@test.com
        const emailArg = process.argv[2];

        if (emailArg) {
            const deletedUser = await prisma.User.deleteMany({
                where: { email: emailArg }
            });
            console.log(`✅ Deleted ${deletedUser.count} user(s) with email: ${emailArg}`);
        } else {
            // Delete all users
            const deletedUsers = await prisma.User.deleteMany({});
            console.log(`✅ Deleted all ${deletedUsers.count} user(s) from the database.`);
        }
    } catch (error) {
        console.error('❌ Error deleting users:', error);
    } finally {
        await prisma.$disconnect();
    }
}

deleteUsers();
