require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const taxonomyRequest = superTest(`${BASE_URL}/api/taxonomy/`);

describe('Taxonomy API', () => {
    const adminId = '531';
    let adminToken;
    let createdCategoryId;
    const slug = `test-cat-${Date.now()}`;

    before(async () => {
        await seedUser({
            id: adminId,
            email: 'betaxonomy531@modellink.test',
            org_username: 'betaxonomy531',
            role: 'ADMIN',
        });
        adminToken = signToken({ id: adminId, role: 'ADMIN' });
    });

    after(async () => {
        if (createdCategoryId) {
            await prisma.category.deleteMany({ where: { id: createdCategoryId } });
        }
        await prisma.user.deleteMany({ where: { id: adminId } });
        await prisma.$disconnect();
    });

    it('GET /categories returns public categories', async () => {
        const res = await taxonomyRequest.get('categories?limit=5');
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.categories).to.be.an('array');
    });

    it('GET /modalities returns public modalities', async () => {
        const res = await taxonomyRequest.get('modalities?limit=5');
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.modalities).to.be.an('array');
    });

    it('GET /bodyparts returns public body parts', async () => {
        const res = await taxonomyRequest.get('bodyparts?limit=5');
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.bodyParts).to.be.an('array');
    });

    it('GET /tags searches tags', async () => {
        const res = await taxonomyRequest.get('tags?search=a&limit=5');
        expect(res.statusCode).to.equal(200);
        expect(res.body.data.tags).to.be.an('array');
    });

    it('GET /categories/manage requires admin', async () => {
        const res = await taxonomyRequest.get('categories/manage');
        expect(res.statusCode).to.equal(401);
    });

    it('POST /categories creates category as admin', async () => {
        const res = await taxonomyRequest
            .post('categories')
            .set(authHeader(adminToken))
            .send({ name: 'Test Category', slug, description: 'Created by API test' });

        expect(res.statusCode).to.equal(201);
        expect(res.body.data.category.slug).to.equal(slug);
        createdCategoryId = res.body.data.category.id;
    });

    it('GET /categories/:id/impact returns impact summary', async () => {
        const res = await taxonomyRequest
            .get(`categories/${createdCategoryId}/impact`)
            .set(authHeader(adminToken));

        expect(res.statusCode).to.equal(200);
        expect(res.body.data).to.have.property('modelCount');
        expect(res.body.data.category.id).to.equal(createdCategoryId);
    });

    it('DELETE /categories/:id removes test category', async () => {
        const res = await taxonomyRequest
            .delete(`categories/${createdCategoryId}`)
            .set(authHeader(adminToken));

        expect(res.statusCode).to.equal(204);
        createdCategoryId = null;
    });
});
