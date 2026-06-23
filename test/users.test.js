require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const usersRequest = superTest(`${BASE_URL}/api/users/`);

describe('Users API', () => {
    const clientId = '401';
    const devId = '402';
    let clientToken;
    let devToken;

    before(async () => {
        await seedUser({
            id: clientId,
            email: 'beclient401@modellink.test',
            org_username: 'beclient401',
            role: 'CLIENT',
        });
        await seedUser({
            id: devId,
            email: 'bedev402@modellink.test',
            org_username: 'bedev402',
            role: 'DEVELOPER',
        });
        clientToken = signToken({ id: clientId, role: 'CLIENT' });
        devToken = signToken({ id: devId, role: 'DEVELOPER' });
    });

    after(async () => {
        await prisma.user.deleteMany({ where: { id: { in: [clientId, devId] } } });
        await prisma.$disconnect();
    });

    it('GET /developers/public returns developer list', async () => {
        const res = await usersRequest.get('developers/public?limit=5');
        expect(res.statusCode).to.equal(200);
        expect(res.body.data).to.have.property('users');
        expect(res.body.data.users).to.be.an('array');
    });

    it('GET /:id/public returns public profile without auth', async () => {
        const res = await usersRequest.get(`${devId}/public`);
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.user.id).to.equal(devId);
        expect(res.body.data.user).to.not.have.property('password');
    });

    it('GET / rejects unauthenticated me request', async () => {
        const res = await usersRequest.get('');
        expect(res.statusCode).to.equal(401);
    });

    it('GET / returns authenticated user profile', async () => {
        const res = await usersRequest.get('').set(authHeader(clientToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.user.id).to.equal(clientId);
    });

    it('GET /:id returns profile for authenticated viewer', async () => {
        const res = await usersRequest.get(devId).set(authHeader(clientToken));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.user.id).to.equal(devId);
    });
});
