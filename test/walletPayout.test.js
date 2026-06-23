require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const walletRequest = superTest(`${BASE_URL}/api/wallets/`);
const payoutRequest = superTest(`${BASE_URL}/api/payouts/`);

describe('Wallet & payout API', () => {
    const devId = '511';
    const adminId = '512';
    let devToken;
    let adminToken;
    let payoutId;

    before(async () => {
        await seedUser({
            id: devId,
            email: 'bewallet511@modellink.test',
            org_username: 'bewallet511',
            role: 'DEVELOPER',
        });
        await seedUser({
            id: adminId,
            email: 'beadmin512@modellink.test',
            org_username: 'beadmin512',
            role: 'ADMIN',
        });

        devToken = signToken({ id: devId, role: 'DEVELOPER' });
        adminToken = signToken({ id: adminId, role: 'ADMIN' });

        await prisma.developerPayout.deleteMany({ where: { userId: devId } });
        await prisma.walletTransaction.deleteMany({ where: { wallet: { userId: devId } } });
        await prisma.wallet.upsert({
            where: { userId: devId },
            update: { availableBalance: 5000, pendingBalance: 0 },
            create: { userId: devId, availableBalance: 5000, pendingBalance: 0 },
        });
    });

    after(async () => {
        if (payoutId) {
            await prisma.walletTransaction.deleteMany({ where: { payoutId } });
            await prisma.developerPayout.deleteMany({ where: { id: payoutId } });
        }
        await prisma.wallet.deleteMany({ where: { userId: devId } });
        await prisma.user.deleteMany({ where: { id: { in: [devId, adminId] } } });
        await prisma.$disconnect();
    });

    it('GET /wallets/me returns or creates developer wallet', async () => {
        const res = await walletRequest.get('me').set(authHeader(devToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.wallet).to.have.property('availableBalance');
        expect(res.body.data.wallet.availableBalance).to.be.at.least(5000);
    });

    it('GET /wallets/transactions returns transaction history', async () => {
        const res = await walletRequest.get('transactions').set(authHeader(devToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.transactions).to.be.an('array');
    });

    it('POST /payouts/request creates payout request', async () => {
        const res = await payoutRequest
            .post('request')
            .set(authHeader(devToken))
            .send({ amount: 1000, note: 'Test payout request' });

        expect(res.statusCode).to.equal(201);
        expect(res.body.data.payout.status).to.equal('PENDING');
        payoutId = res.body.data.payout.id;
    });

    it('GET /payouts/me lists developer payouts', async () => {
        const res = await payoutRequest.get('me').set(authHeader(devToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.payouts).to.be.an('array');
        expect(res.body.data.payouts.some((p) => p.id === payoutId)).to.equal(true);
    });

    it('GET /payouts/ lists payouts for admin', async () => {
        const res = await payoutRequest.get('').set(authHeader(adminToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.payouts).to.be.an('array');
    });

    it('PATCH /payouts/:id/approve approves payout as admin', async () => {
        const res = await payoutRequest
            .patch(`${payoutId}/approve`)
            .set(authHeader(adminToken))
            .send({ adminNote: 'Approved in test' });

        expect(res.statusCode).to.equal(200);
        expect(res.body.data.payout.status).to.equal('PAID');
    });
});
