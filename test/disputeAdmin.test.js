require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const disputeRequest = superTest(`${BASE_URL}/api/disputes/`);
const adminRequest = superTest(`${BASE_URL}/api/admin/`);

describe('Dispute & admin settings API', () => {
    const clientId = '521';
    const devId = '522';
    const adminId = '523';
    const modelId = 521;
    const versionId = 521;
    const orderId = 521;

    let clientToken;
    let devToken;
    let adminToken;
    let disputeId;

    before(async () => {
        await seedUser({
            id: clientId,
            email: 'bedispute521@modellink.test',
            org_username: 'bedispute521',
            role: 'CLIENT',
        });
        await seedUser({
            id: devId,
            email: 'bedispute522@modellink.test',
            org_username: 'bedispute522',
            role: 'DEVELOPER',
        });
        await seedUser({
            id: adminId,
            email: 'beadmin523@modellink.test',
            org_username: 'beadmin523',
            role: 'ADMIN',
        });

        clientToken = signToken({ id: clientId, role: 'CLIENT' });
        devToken = signToken({ id: devId, role: 'DEVELOPER' });
        adminToken = signToken({ id: adminId, role: 'ADMIN' });

        await prisma.dispute.deleteMany({ where: { orderId } });
        await prisma.transaction.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });

        await prisma.aiModel.create({
            data: {
                id: modelId,
                title: 'Dispute Test Model',
                category: 'Diagnostics',
                desc: 'Dispute test',
                status: 'PUBLISHED',
                developerId: devId,
            },
        });

        await prisma.aiModelVersion.create({
            data: {
                id: versionId,
                version: '1.0.0',
                price: 800,
                isPrimary: true,
                isActive: true,
                aiModelId: modelId,
            },
        });

        await prisma.order.create({
            data: {
                id: orderId,
                clientId,
                developerId: devId,
                aiModelId: modelId,
                versionId,
                purchasePrice: 800,
                stripePaymentIntentId: 'pi_dispute_test_521',
                title: 'Dispute Test Order',
                img: 'default.png',
                status: 'PAID',
            },
        });

        await prisma.wallet.upsert({
            where: { userId: devId },
            update: { pendingBalance: 640 },
            create: { userId: devId, pendingBalance: 640 },
        });
    });

    after(async () => {
        await prisma.dispute.deleteMany({ where: { orderId } });
        await prisma.transaction.deleteMany({ where: { orderId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });
        await prisma.wallet.deleteMany({ where: { userId: devId } });
        await prisma.user.deleteMany({ where: { id: { in: [clientId, devId, adminId] } } });
        await prisma.$disconnect();
    });

    it('POST /disputes opens dispute as client', async () => {
        const res = await disputeRequest
            .post('')
            .set(authHeader(clientToken))
            .send({
                orderId,
                reason: 'Model output quality did not match the listing description at all.',
            });

        expect(res.statusCode).to.equal(201);
        expect(res.body.data.dispute.status).to.equal('OPEN');
        disputeId = res.body.data.dispute.id;

        const order = await prisma.order.findUnique({ where: { id: orderId } });
        expect(order.status).to.equal('DISPUTED');
    });

    it('GET /disputes lists disputes for client', async () => {
        const res = await disputeRequest.get('').set(authHeader(clientToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.disputes).to.be.an('array');
        expect(res.body.data.disputes.some((d) => d.id === disputeId)).to.equal(true);
    });

    it('GET /disputes lists disputes for developer', async () => {
        const res = await disputeRequest.get('').set(authHeader(devToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.disputes).to.be.an('array');
    });

    it('GET /admin/pending-counts returns dashboard counts', async () => {
        const res = await adminRequest.get('pending-counts').set(authHeader(adminToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.counts).to.have.keys(['payouts', 'verifications', 'disputes', 'webhooks']);
    });

    it('GET /admin/settings returns platform settings', async () => {
        const res = await adminRequest.get('settings').set(authHeader(adminToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.settings).to.have.property('platformFeeValue');
    });

    it('GET /admin/audit-logs returns audit log list', async () => {
        const res = await adminRequest.get('audit-logs?limit=5').set(authHeader(adminToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.logs).to.be.an('array');
    });

    it('GET /admin/webhooks returns webhook events', async () => {
        const res = await adminRequest.get('webhooks?limit=5').set(authHeader(adminToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.webhooks).to.be.an('array');
    });

    it('PATCH /disputes/:id/resolve resolves dispute as admin', async () => {
        const res = await disputeRequest
            .patch(`${disputeId}/resolve`)
            .set(authHeader(adminToken))
            .send({
                resolution: 'REFUND_CLIENT',
                notes: 'Refund issued after review of buyer evidence.',
            });

        expect(res.statusCode).to.equal(200);
        expect(res.body.data.dispute.status).to.equal('RESOLVED');
    });
});
