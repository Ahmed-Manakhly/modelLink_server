require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const orderRequest = superTest(`${BASE_URL}/api/orders/`);

describe('Order lifecycle API', () => {
    const clientId = '501';
    const devId = '502';
    const modelId = 501;
    const versionId = 501;

    let clientToken;
    let devToken;
    let createdOrderId;
    let paymentIntentId;

    before(async () => {
        await seedUser({
            id: clientId,
            email: 'beorder501@modellink.test',
            org_username: 'beorder501',
            role: 'CLIENT',
        });
        await seedUser({
            id: devId,
            email: 'beorder502@modellink.test',
            org_username: 'beorder502',
            role: 'DEVELOPER',
        });

        clientToken = signToken({ id: clientId, role: 'CLIENT' });
        devToken = signToken({ id: devId, role: 'DEVELOPER' });

        await prisma.order.deleteMany({ where: { aiModelId: modelId } });
        await prisma.walletTransaction.deleteMany({ where: { order: { aiModelId: modelId } } });
        await prisma.transaction.deleteMany({ where: { order: { aiModelId: modelId } } });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });

        await prisma.aiModel.create({
            data: {
                id: modelId,
                title: 'Order Lifecycle Model',
                category: 'Diagnostics',
                desc: 'Order lifecycle test',
                status: 'PUBLISHED',
                developerId: devId,
            },
        });

        await prisma.aiModelVersion.create({
            data: {
                id: versionId,
                version: '1.0.0',
                price: 500,
                isPrimary: true,
                isActive: true,
                aiModelId: modelId,
            },
        });

        await prisma.wallet.upsert({
            where: { userId: devId },
            update: { availableBalance: 0, pendingBalance: 0 },
            create: { userId: devId, availableBalance: 0, pendingBalance: 0 },
        });
    });

    after(async () => {
        if (createdOrderId) {
            await prisma.notification.deleteMany({ where: { actionLink: { contains: String(createdOrderId) } } });
            await prisma.walletTransaction.deleteMany({ where: { orderId: createdOrderId } });
            await prisma.transaction.deleteMany({ where: { orderId: createdOrderId } });
            await prisma.order.deleteMany({ where: { id: createdOrderId } });
        }
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });
        await prisma.wallet.deleteMany({ where: { userId: devId } });
        await prisma.user.deleteMany({ where: { id: { in: [clientId, devId] } } });
        await prisma.$disconnect();
    });

    it('POST /create-payment-intent creates a pending order for client', async () => {
        const res = await orderRequest
            .post('create-payment-intent')
            .set(authHeader(clientToken))
            .send({ aiModelId: modelId, versionId });

        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
        expect(res.body.data.order.status).to.equal('PENDING');
        expect(res.body.data.order.clientId).to.equal(clientId);
        expect(res.body.clientSecret).to.be.a('string');

        createdOrderId = res.body.data.order.id;
        paymentIntentId = res.body.data.order.stripePaymentIntentId;
    });

    it('POST /stripe-webhook marks order as PAID (mock)', async () => {
        const res = await orderRequest
            .post('stripe-webhook')
            .send({
                id: `evt_test_${Date.now()}`,
                type: 'payment_intent.succeeded',
                data: { object: { id: paymentIntentId } },
            });

        expect(res.statusCode).to.equal(200);

        const order = await prisma.order.findUnique({ where: { id: createdOrderId } });
        expect(order.status).to.equal('PAID');
    });

    it('GET /:id returns order details for buyer', async () => {
        const res = await orderRequest
            .get(String(createdOrderId))
            .set(authHeader(clientToken));

        expect(res.statusCode).to.equal(200);
        expect(res.body.data.order.id).to.equal(createdOrderId);
        expect(res.body.data.order.status).to.equal('PAID');
    });

    it('PATCH /:id/deliver confirms delivery as developer', async () => {
        const res = await orderRequest
            .patch(`${createdOrderId}/deliver`)
            .set(authHeader(devToken))
            .send({});

        expect(res.statusCode).to.equal(200);
        expect(res.body.data.order.status).to.equal('DELIVERED');
    });

    it('POST /create-payment-intent rejects developer buyers', async () => {
        const res = await orderRequest
            .post('create-payment-intent')
            .set(authHeader(devToken))
            .send({ aiModelId: modelId, versionId });

        expect(res.statusCode).to.equal(403);
    });
});
