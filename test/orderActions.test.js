require('dotenv').config();
const superTest = require("supertest");
const expect = require("chai").expect;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

const orderRequest = superTest("http://localhost:8000/api/orders/");
const adminRequest = superTest("http://localhost:8000/api/admin/");

describe("Order Actions & Financial Auditing Sub-system", () => {
    let clientToken;
    let devToken;
    let otherClientToken;
    let adminToken;

    const testClientId = "201";
    const testDevId = "202";
    const otherClientId = "203";
    const testAdminId = "204";

    const testModelId = 201;
    const testVersionId = 201;

    let pendingOrderId;
    let paidOrderId;
    let deliveredOrderId;

    let transactionId;

    before(async () => {
        const hashedPassword = await require('bcrypt').hash("Password123!", 10);

        // Seed users
        await prisma.user.upsert({
            where: { id: testClientId },
            update: { isActive: true },
            create: {
                id: testClientId,
                customId: "USR-00000000000201",
                email: "client201@modellink.com",
                org_username: "client201",
                password: hashedPassword,
                role: "CLIENT",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: testDevId },
            update: { isActive: true },
            create: {
                id: testDevId,
                customId: "USR-00000000000202",
                email: "dev202@modellink.com",
                org_username: "dev202",
                password: hashedPassword,
                role: "DEVELOPER",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: otherClientId },
            update: { isActive: true },
            create: {
                id: otherClientId,
                customId: "USR-00000000000203",
                email: "client203@modellink.com",
                org_username: "client203",
                password: hashedPassword,
                role: "CLIENT",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: testAdminId },
            update: { isActive: true },
            create: {
                id: testAdminId,
                customId: "USR-00000000000204",
                email: "admin204@modellink.com",
                org_username: "admin204",
                password: hashedPassword,
                role: "ADMIN",
                isActive: true
            }
        });

        // Seed wallets
        await prisma.wallet.upsert({
            where: { userId: testDevId },
            update: { availableBalance: 10000, pendingBalance: 5000 },
            create: {
                userId: testDevId,
                availableBalance: 10000,
                pendingBalance: 5000,
                totalEarnings: 15000
            }
        });

        // Seed model & version
        await prisma.aiModel.upsert({
            where: { id: testModelId },
            update: {},
            create: {
                id: testModelId,
                title: "Financial Test AI Model",
                category: "Diagnostics",
                desc: "Description",
                developerId: testDevId
            }
        });

        await prisma.aiModelVersion.upsert({
            where: { id: testVersionId },
            update: {},
            create: {
                id: testVersionId,
                version: "1.0.0",
                price: 1000,
                aiModelId: testModelId
            }
        });

        // Clean up any existing test orders for safety
        await prisma.walletTransaction.deleteMany({
            where: { orderId: { in: [211, 212, 213] } }
        });
        await prisma.transaction.deleteMany({
            where: { orderId: { in: [211, 212, 213] } }
        });
        await prisma.order.deleteMany({
            where: { id: { in: [211, 212, 213] } }
        });

        // Seed orders
        const pendingOrder = await prisma.order.create({
            data: {
                id: 211,
                clientId: testClientId,
                developerId: testDevId,
                aiModelId: testModelId,
                versionId: testVersionId,
                purchasePrice: 1000,
                stripePaymentIntentId: "pi_test_pending_211",
                title: "Test Order Pending",
                img: "default.png",
                status: "PENDING"
            }
        });
        pendingOrderId = pendingOrder.id;

        const paidOrder = await prisma.order.create({
            data: {
                id: 212,
                clientId: testClientId,
                developerId: testDevId,
                aiModelId: testModelId,
                versionId: testVersionId,
                purchasePrice: 1000,
                stripePaymentIntentId: "pi_test_paid_212",
                title: "Test Order Paid",
                img: "default.png",
                status: "PAID"
            }
        });
        paidOrderId = paidOrder.id;

        const deliveredOrder = await prisma.order.create({
            data: {
                id: 213,
                clientId: testClientId,
                developerId: testDevId,
                aiModelId: testModelId,
                versionId: testVersionId,
                purchasePrice: 1000,
                stripePaymentIntentId: "pi_test_delivered_213",
                title: "Test Order Delivered",
                img: "default.png",
                status: "DELIVERED"
            }
        });
        deliveredOrderId = deliveredOrder.id;

        // Seed transaction for delivered order (required for audit logging lookup tests)
        const tx = await prisma.transaction.create({
            data: {
                orderId: deliveredOrderId,
                stripeEventId: "evt_test_213",
                grossAmount: 1000,
                platformFee: 200,
                developerPayout: 800,
                currency: "usd"
            }
        });
        transactionId = tx.id;

        // Generate tokens
        const secret = process.env.ACCESS_SECRET_STR || 'AD7-FGH-HUKYUK111ddd-2545-aSDA@ER-UKY11125UKddd-2545-aSDA@ER';
        clientToken = jwt.sign({ id: testClientId, role: "CLIENT" }, secret, { expiresIn: '1d' });
        devToken = jwt.sign({ id: testDevId, role: "DEVELOPER" }, secret, { expiresIn: '1d' });
        otherClientToken = jwt.sign({ id: otherClientId, role: "CLIENT" }, secret, { expiresIn: '1d' });
        adminToken = jwt.sign({ id: testAdminId, role: "ADMIN" }, secret, { expiresIn: '1d' });
    });

    after(async () => {
        // Clean up created entities
        await prisma.walletTransaction.deleteMany({
            where: { orderId: { in: [pendingOrderId, paidOrderId, deliveredOrderId] } }
        });
        await prisma.transaction.deleteMany({
            where: { orderId: { in: [pendingOrderId, paidOrderId, deliveredOrderId] } }
        });
        await prisma.order.deleteMany({
            where: { id: { in: [pendingOrderId, paidOrderId, deliveredOrderId] } }
        });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: testModelId } });
        await prisma.aiModel.delete({ where: { id: testModelId } });
        await prisma.wallet.deleteMany({ where: { userId: { in: [testClientId, testDevId, otherClientId] } } });
        await prisma.user.deleteMany({ where: { id: { in: [testClientId, testDevId, otherClientId, testAdminId] } } });
        await prisma.$disconnect();
    });

    describe("Order Cancellation Workflow", () => {
        it("should refuse cancellation to unauthorized users", async () => {
            const res = await orderRequest
                .patch(`${paidOrderId}/cancel`)
                .set("Authorization", `Bearer ${otherClientToken}`);

            expect(res.statusCode).to.equal(403);
        });

        it("should allow the buyer client to cancel a PENDING order", async () => {
            const res = await orderRequest
                .patch(`${pendingOrderId}/cancel`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.order.status).to.equal("CANCELLED");
        });

        it("should allow buyer client to cancel a PAID order and adjust developer pending balance", async () => {
            // Check wallet state before
            const walletBefore = await prisma.wallet.findUnique({ where: { userId: testDevId } });
            const initialPending = walletBefore.pendingBalance;

            const res = await orderRequest
                .patch(`${paidOrderId}/cancel`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.order.status).to.equal("CANCELLED");

            // Verify developer wallet clawback
            const walletAfter = await prisma.wallet.findUnique({ where: { userId: testDevId } });
            const expectedClawback = 800; // 1000 purchase price - 20% platform fee
            expect(walletAfter.pendingBalance).to.equal(initialPending - expectedClawback);
        });

        it("should refuse cancellation of a DELIVERED order", async () => {
            const res = await orderRequest
                .patch(`${deliveredOrderId}/cancel`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(400);
        });
    });

    describe("Order Refund Workflow (Admin Dispute Management)", () => {
        it("should refuse refund triggers to non-admins (clientToken)", async () => {
            const res = await orderRequest
                .patch(`${deliveredOrderId}/refund`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(403);
        });

        it("should allow admin to refund a DELIVERED order and decrement developer available balance", async () => {
            // Check wallet state before
            const walletBefore = await prisma.wallet.findUnique({ where: { userId: testDevId } });
            const initialAvailable = walletBefore.availableBalance;

            const res = await orderRequest
                .patch(`${deliveredOrderId}/refund`)
                .set("Authorization", `Bearer ${adminToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.order.status).to.equal("REFUNDED");

            // Verify developer wallet clawback from availableBalance
            const walletAfter = await prisma.wallet.findUnique({ where: { userId: testDevId } });
            const expectedClawback = 800; // 1000 - 200 fee
            expect(walletAfter.availableBalance).to.equal(initialAvailable - expectedClawback);
        });
    });

    describe("Financial Transactions Lookup (Admin Auditing)", () => {
        it("should refuse transaction list retrieval to non-admins", async () => {
            const res = await adminRequest
                .get("transactions")
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(403);
        });

        it("should allow admin to list all transactions", async () => {
            const res = await adminRequest
                .get("transactions")
                .set("Authorization", `Bearer ${adminToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.transactions).to.be.an("array");
            expect(res.body.data.transactions.length).to.be.at.least(1);
        });

        it("should allow admin to fetch single transaction details", async () => {
            const res = await adminRequest
                .get(`transactions/${transactionId}`)
                .set("Authorization", `Bearer ${adminToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.transaction.id).to.equal(transactionId);
            expect(res.body.data.transaction.grossAmount).to.equal(1000);
        });
    });

    describe("Order filtering via GET /orders", () => {
        it("should allow authenticated users to get orders by model id", async () => {
            const res = await orderRequest
                .get(`?aiModelId=${testModelId}`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.status).to.equal("success");
            expect(res.body.data.orders).to.be.an("array");
            expect(res.body.data.orders.length).to.be.at.least(1);
            expect(res.body.data.orders[0].aiModelId).to.equal(testModelId);
        });

        it("should allow authenticated users to get orders by dev id", async () => {
            const res = await orderRequest
                .get(`?developerId=${testDevId}`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.status).to.equal("success");
            expect(res.body.data.orders).to.be.an("array");
            expect(res.body.data.orders.length).to.be.at.least(1);
            expect(res.body.data.orders[0].developerId).to.equal(testDevId);
        });

        it("should allow authenticated users to get orders by client id", async () => {
            const res = await orderRequest
                .get(`?clientId=${testClientId}`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.status).to.equal("success");
            expect(res.body.data.orders).to.be.an("array");
            expect(res.body.data.orders.length).to.be.at.least(1);
            expect(res.body.data.orders[0].clientId).to.equal(testClientId);
        });

        it("should reject unauthenticated requests to filter orders", async () => {
            const res = await orderRequest.get(`?aiModelId=${testModelId}`);
            expect(res.statusCode).to.equal(401);
        });
    });
});
