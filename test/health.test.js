const superTest = require('supertest');
const { expect } = require('chai');
const { BASE_URL } = require('./helpers/testSetup');

describe('Health & root', () => {
    it('GET / returns server running message', async () => {
        const res = await superTest(BASE_URL).get('/');
        expect(res.statusCode).to.equal(200);
        expect(res.text).to.include('server is running');
    });

    it('GET /api/health returns success', async () => {
        const res = await superTest(BASE_URL).get('/api/health');
        expect(res.statusCode).to.equal(200);
        expect(res.body.status).to.equal('success');
    });
});
