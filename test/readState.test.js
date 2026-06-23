require('dotenv').config();
const superTest = require("supertest");
const expect = require("chai").expect;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

const messageRequest = superTest("http://localhost:8000/api/messages/");
const notificationRequest = superTest("http://localhost:8000/api/notification/");

describe("Messaging & Notifications Read-State Sub-system", () => {
    let user1Token;
    let user2Token;

    const testUser1Id = "301";
    const testUser2Id = "302";
    const testUser3Id = "303";

    const testConvId1 = 301;
    const testConvId2 = 302;

    before(async () => {
        const hashedPassword = await require('bcrypt').hash("Password123!", 10);

        // Seed users
        await prisma.user.upsert({
            where: { id: testUser1Id },
            update: { isActive: true },
            create: {
                id: testUser1Id,
                customId: "USR-00000000000301",
                email: "user301@modellink.com",
                org_username: "user301",
                password: hashedPassword,
                role: "CLIENT",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: testUser2Id },
            update: { isActive: true },
            create: {
                id: testUser2Id,
                customId: "USR-00000000000302",
                email: "user302@modellink.com",
                org_username: "user302",
                password: hashedPassword,
                role: "CLIENT",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: testUser3Id },
            update: { isActive: true },
            create: {
                id: testUser3Id,
                customId: "USR-00000000000303",
                email: "user303@modellink.com",
                org_username: "user303",
                password: hashedPassword,
                role: "CLIENT",
                isActive: true
            }
        });

        // Clean up conversations
        await prisma.conversation.deleteMany({
            where: { id: { in: [testConvId1, testConvId2] } }
        });

        // Seed conversations and participants
        await prisma.conversation.create({
            data: {
                id: testConvId1,
                lastMessage: "Hello user 1",
                unReadMsg: 5,
                participants: {
                    create: [
                        { userId: testUser1Id },
                        { userId: testUser3Id }
                    ]
                }
            }
        });

        await prisma.conversation.create({
            data: {
                id: testConvId2,
                lastMessage: "Hello user 2",
                unReadMsg: 2,
                participants: {
                    create: [
                        { userId: testUser2Id },
                        { userId: testUser3Id }
                    ]
                }
            }
        });

        // Clean up notifications
        await prisma.notification.deleteMany({
            where: { recipientId: { in: [testUser1Id, testUser2Id, testUser3Id] } }
        });

        // Seed notifications
        await prisma.notification.createMany({
            data: [
                { recipientId: testUser1Id, actionDesc: "Notif 1 for user 1", unRead: true },
                { recipientId: testUser1Id, actionDesc: "Notif 2 for user 1", unRead: true },
                { recipientId: testUser2Id, actionDesc: "Notif 1 for user 2", unRead: true }
            ]
        });

        // Generate tokens
        const secret = process.env.ACCESS_SECRET_STR || 'AD7-FGH-HUKYUK111ddd-2545-aSDA@ER-UKY11125UKddd-2545-aSDA@ER';
        user1Token = jwt.sign({ id: testUser1Id, role: "CLIENT" }, secret, { expiresIn: '1d' });
        user2Token = jwt.sign({ id: testUser2Id, role: "CLIENT" }, secret, { expiresIn: '1d' });
    });

    after(async () => {
        // Clean up created entities
        await prisma.conversation.deleteMany({
            where: { id: { in: [testConvId1, testConvId2] } }
        });
        await prisma.notification.deleteMany({
            where: { recipientId: { in: [testUser1Id, testUser2Id, testUser3Id] } }
        });
        await prisma.user.deleteMany({ where: { id: { in: [testUser1Id, testUser2Id, testUser3Id] } } });
        await prisma.$disconnect();
    });

    describe("Conversation Read-State Updates", () => {
        it("should refuse to mark conversation read if conversation does not belong to the user", async () => {
            const res = await messageRequest
                .patch(`read/${testConvId1}`)
                .set("Authorization", `Bearer ${user2Token}`);

            expect(res.statusCode).to.equal(403);
        });

        it("should allow a participant to mark their conversation copy as read", async () => {
            const res = await messageRequest
                .patch(`read/${testConvId1}`)
                .set("Authorization", `Bearer ${user1Token}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.conversation.unReadMsg).to.equal(0);

            // Double check in DB
            const conv = await prisma.conversation.findUnique({ where: { id: testConvId1 } });
            expect(conv.unReadMsg).to.equal(0);
        });
    });

    describe("Notification Read-All Action", () => {
        it("should allow user to mark all their unread notifications as read", async () => {
            const res = await notificationRequest
                .patch("read-all")
                .set("Authorization", `Bearer ${user1Token}`);

            expect(res.statusCode).to.equal(200);

            // Double check in DB
            const unreadCount = await prisma.notification.count({
                where: { recipientId: testUser1Id, unRead: true }
            });
            expect(unreadCount).to.equal(0);

            // Other user's notification should remain unread
            const otherUnreadCount = await prisma.notification.count({
                where: { recipientId: testUser2Id, unRead: true }
            });
            expect(otherUnreadCount).to.equal(1);
        });
    });

    describe("Notification Route Security Checks", () => {
        let testNotificationId;

        before(async () => {
            const notif = await prisma.notification.create({
                data: { recipientId: testUser1Id, actionDesc: "Sec Check Notif" }
            });
            testNotificationId = notif.id;
        });

        after(async () => {
            await prisma.notification.deleteMany({
                where: { id: testNotificationId }
            });
        });

        it("should reject unauthenticated request to get notifications", async () => {
            const res = await notificationRequest.get(`${testUser1Id}`);
            expect(res.statusCode).to.equal(401);
        });

        it("should reject retrieval of another user's notifications", async () => {
            const res = await notificationRequest
                .get(`${testUser1Id}`)
                .set("Authorization", `Bearer ${user2Token}`);
            expect(res.statusCode).to.equal(403);
        });

        it("should allow retrieving own notifications", async () => {
            const res = await notificationRequest
                .get(`${testUser1Id}`)
                .set("Authorization", `Bearer ${user1Token}`);
            expect(res.statusCode).to.equal(200);
        });

        it("should reject deleting another user's notification", async () => {
            const res = await notificationRequest
                .delete(`${testNotificationId}`)
                .set("Authorization", `Bearer ${user2Token}`);
            expect(res.statusCode).to.equal(403);
        });

        it("should allow deleting own notification", async () => {
            const res = await notificationRequest
                .delete(`${testNotificationId}`)
                .set("Authorization", `Bearer ${user1Token}`);
            expect(res.statusCode).to.equal(204);
        });
    });
});
