require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const reviewRequest = superTest(`${BASE_URL}/api/reviews/`);

describe('Reviews by model (public read)', () => {
    const clientId = '561';
    const devId = '562';
    const modelId = 561;
    const versionId = 561;
    const orderId = 561;

    let clientToken;

    before(async () => {
        await seedUser({
            id: clientId,
            email: 'bereview561@modellink.test',
            org_username: 'bereview561',
            role: 'CLIENT',
        });
        await seedUser({
            id: devId,
            email: 'bereview562@modellink.test',
            org_username: 'bereview562',
            role: 'DEVELOPER',
        });

        clientToken = signToken({ id: clientId, role: 'CLIENT' });

        await prisma.review.deleteMany({ where: { aiModelId: modelId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });

        await prisma.aiModel.create({
            data: {
                id: modelId,
                title: 'Public Reviews Model',
                category: 'Diagnostics',
                desc: 'Review visibility test',
                status: 'PUBLISHED',
                developerId: devId,
            },
        });

        await prisma.aiModelVersion.create({
            data: {
                id: versionId,
                version: '1.0.0',
                price: 300,
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
                purchasePrice: 300,
                stripePaymentIntentId: 'pi_review_public_561',
                title: 'Public Reviews Order',
                img: 'default.png',
                status: 'DELIVERED',
            },
        });

        await reviewRequest
            .post('/')
            .set(authHeader(clientToken))
            .send({
                aiModelId: modelId,
                orderId,
                versionId,
                desc: 'Great model for public review visibility testing.',
                star: 5,
            });
    });

    after(async () => {
        await prisma.review.deleteMany({ where: { aiModelId: modelId } });
        await prisma.order.deleteMany({ where: { id: orderId } });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });
        await prisma.user.deleteMany({ where: { id: { in: [clientId, devId] } } });
        await prisma.$disconnect();
    });

    it('GET /byModel/:id returns reviews without authentication', async () => {
        const res = await reviewRequest.get(`byModel/${modelId}`);
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.allReviews).to.be.an('array');
        expect(res.body.data.allReviews.length).to.be.at.least(1);
        expect(res.body.data.allReviews[0].star).to.equal(5);
    });

    it('GET /byModel/:id returns reviews for authenticated developer', async () => {
        const devToken = signToken({ id: devId, role: 'DEVELOPER' });
        const res = await reviewRequest
            .get(`byModel/${modelId}`)
            .set(authHeader(devToken));

        expect(res.statusCode).to.equal(200);
        expect(res.body.data.allReviews.length).to.be.at.least(1);
    });
});
