require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const modelRequest = superTest(`${BASE_URL}/api/aiModel/`);

describe('AI Model catalog API', () => {
    const devId = '411';
    const modelId = 411;
    const versionId = 411;
    let devToken;

    before(async () => {
        await seedUser({
            id: devId,
            email: 'becatalog411@modellink.test',
            org_username: 'becatalog411',
            role: 'DEVELOPER',
        });
        devToken = signToken({ id: devId, role: 'DEVELOPER' });

        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });

        await prisma.aiModel.create({
            data: {
                id: modelId,
                title: 'Catalog Test Model',
                category: 'Diagnostics',
                desc: 'Catalog test description',
                status: 'PUBLISHED',
                developerId: devId,
            },
        });

        await prisma.aiModelVersion.create({
            data: {
                id: versionId,
                version: '1.0.0',
                price: 750,
                isPrimary: true,
                isActive: true,
                aiModelId: modelId,
            },
        });
    });

    after(async () => {
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: modelId } });
        await prisma.aiModel.deleteMany({ where: { id: modelId } });
        await prisma.user.deleteMany({ where: { id: devId } });
        await prisma.$disconnect();
    });

    it('GET / lists published models publicly', async () => {
        const res = await modelRequest.get('?status=PUBLISHED&limit=5');
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.models).to.be.an('array');
    });

    it('GET /filters returns filter metadata', async () => {
        const res = await modelRequest.get('filters');
        expect(res.statusCode).to.equal(200);
        expect(res.body.data).to.exist;
    });

    it('GET /:id returns model details publicly', async () => {
        const res = await modelRequest.get(String(modelId));
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.model.id).to.equal(modelId);
        expect(res.body.data.model.title).to.equal('Catalog Test Model');
    });

    it('GET /byUser/:id returns models for developer', async () => {
        const res = await modelRequest.get(`byUser/${devId}`);
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.models).to.be.an('array');
        expect(res.body.data.models.some((m) => m.id === modelId)).to.equal(true);
    });

    it('GET /:id/versions lists model versions publicly', async () => {
        const res = await modelRequest.get(`${modelId}/versions`);
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.versions).to.be.an('array');
        expect(res.body.data.versions.length).to.be.at.least(1);
    });
});
