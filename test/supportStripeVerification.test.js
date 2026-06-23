require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const supportRequest = superTest(`${BASE_URL}/api/support/`);
const stripeRequest = superTest(`${BASE_URL}/api/stripe/`);
const verificationRequest = superTest(`${BASE_URL}/api/verifications/`);

describe('Support, Stripe Connect & verification API', () => {
    const devId = '551';
    const adminId = '552';
    let devToken;
    let adminToken;

    before(async () => {
        await seedUser({
            id: devId,
            email: 'bestripe551@modellink.test',
            org_username: 'bestripe551',
            role: 'DEVELOPER',
        });
        await seedUser({
            id: adminId,
            email: 'beverify552@modellink.test',
            org_username: 'beverify552',
            role: 'ADMIN',
        });

        devToken = signToken({ id: devId, role: 'DEVELOPER' });
        adminToken = signToken({ id: adminId, role: 'ADMIN' });

        await prisma.developerVerification.deleteMany({ where: { userId: devId } });
    });

    after(async () => {
        await prisma.developerVerification.deleteMany({ where: { userId: devId } });
        await prisma.user.deleteMany({ where: { id: { in: [devId, adminId] } } });
        await prisma.$disconnect();
    });

    describe('Support', () => {
        it('POST /support/contact rejects invalid payload', async () => {
            const res = await supportRequest.post('contact').send({
                firstName: 'A',
                lastName: 'B',
                email: 'not-an-email',
                message: 'short',
            });

            expect(res.statusCode).to.equal(400);
        });

        it('POST /support/contact accepts valid contact form', async () => {
            const res = await supportRequest
                .post('contact')
                .set(authHeader(devToken))
                .send({
                    firstName: 'Backend',
                    lastName: 'Tester',
                    email: 'backend.tester@modellink.test',
                    message: 'This is an automated backend test message for support endpoint.',
                });

            expect(res.statusCode).to.equal(201);
            expect(res.body.status).to.equal('success');
        });
    });

    describe('Stripe Connect', () => {
        it('GET /stripe/connect/status returns connect flags', async () => {
            const res = await stripeRequest.get('connect/status').set(authHeader(devToken));
            expect(res.statusCode).to.equal(200);
            expect(res.body.data).to.have.keys([
                'stripeAccountId',
                'stripeChargesEnabled',
                'stripeDetailsSubmitted',
                'payoutReady',
            ]);
        });

        it('POST /stripe/connect/complete-demo completes demo setup', async () => {
            const res = await stripeRequest
                .post('connect/complete-demo')
                .set(authHeader(devToken))
                .send({});

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.payoutReady).to.equal(true);
        });
    });

    describe('Developer verification', () => {
        it('GET /verifications/me returns verification status for developer', async () => {
            const res = await verificationRequest.get('me').set(authHeader(devToken));
            expect(res.statusCode).to.equal(200);
            expect(res.body.data).to.have.property('verification');
        });

        it('GET /verifications lists pending verifications for admin', async () => {
            const res = await verificationRequest.get('').set(authHeader(adminToken));
            expect(res.statusCode).to.equal(200);
            expect(res.body.data.verifications).to.be.an('array');
        });
    });
});
