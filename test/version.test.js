require('dotenv').config();
const superTest = require("supertest");
const expect = require("chai").expect;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

const request = superTest("http://localhost:8000/api/aiModel/");

describe("AI Model Versioning Sub-system", () => {
    let clientToken;
    let developerToken;
    let otherDevToken;
    let adminToken;

    let testModelId = 101;
    let versionId;
    let featureId;
    let metricId;
    let assetId;

    before(async () => {
        const hashedPassword = await require('bcrypt').hash("Password123!", 10);

        // Seed users
        await prisma.user.upsert({
            where: { id: "101" },
            update: { isActive: true },
            create: {
                id: "101",
                customId: "USR-00000000000101",
                email: "client101@modellink.com",
                org_username: "client101",
                password: hashedPassword,
                role: "CLIENT",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: "102" },
            update: { isActive: true },
            create: {
                id: "102",
                customId: "USR-00000000000102",
                email: "dev102@modellink.com",
                org_username: "dev102",
                password: hashedPassword,
                role: "DEVELOPER",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: "103" },
            update: { isActive: true },
            create: {
                id: "103",
                customId: "USR-00000000000103",
                email: "dev103@modellink.com",
                org_username: "dev103",
                password: hashedPassword,
                role: "DEVELOPER",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: "104" },
            update: { isActive: true },
            create: {
                id: "104",
                customId: "USR-00000000000104",
                email: "admin104@modellink.com",
                org_username: "admin104",
                password: hashedPassword,
                role: "ADMIN",
                isActive: true
            }
        });

        // Seed parent AI Model owned by dev 102
        await prisma.order.deleteMany({ where: { stripePaymentIntentId: "pi_test_version_download_1" } });
        await prisma.modelAsset.deleteMany({ where: { version: { aiModelId: testModelId } } });
        await prisma.aiModelMetric.deleteMany({ where: { version: { aiModelId: testModelId } } });
        await prisma.aiModelFeature.deleteMany({ where: { version: { aiModelId: testModelId } } });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: testModelId } });
        await prisma.aiModel.deleteMany({ where: { id: testModelId } });

        await prisma.aiModel.upsert({
            where: { id: testModelId },
            update: {},
            create: {
                id: testModelId,
                title: "Versioned Test AI Model",
                category: "Diagnostics",
                desc: "Test description for versioned model",
                developerId: "102"
            }
        });

        // Generate tokens
        const secret = process.env.ACCESS_SECRET_STR || 'AD7-FGH-HUKYUK111ddd-2545-aSDA@ER-UKY11125UKddd-2545-aSDA@ER';
        clientToken = jwt.sign({ id: "101", role: "CLIENT" }, secret, { expiresIn: '1d' });
        developerToken = jwt.sign({ id: "102", role: "DEVELOPER" }, secret, { expiresIn: '1d' });
        otherDevToken = jwt.sign({ id: "103", role: "DEVELOPER" }, secret, { expiresIn: '1d' });
        adminToken = jwt.sign({ id: "104", role: "ADMIN" }, secret, { expiresIn: '1d' });
    });

    after(async () => {
        // Clean up created entities
        await prisma.modelAsset.deleteMany({ where: { version: { aiModelId: testModelId } } });
        await prisma.aiModelMetric.deleteMany({ where: { version: { aiModelId: testModelId } } });
        await prisma.aiModelFeature.deleteMany({ where: { version: { aiModelId: testModelId } } });
        await prisma.aiModelVersion.deleteMany({ where: { aiModelId: testModelId } });
        await prisma.aiModel.delete({ where: { id: testModelId } });
        await prisma.$disconnect();
    });

    describe("Version Management", () => {
        it("should refuse version creation if user is not the owner (otherDevToken)", async () => {
            const res = await request
                .post(`${testModelId}/versions`)
                .set("Authorization", `Bearer ${otherDevToken}`)
                .send({ version: "1.0.0", price: 1000 });

            expect(res.statusCode).to.equal(403);
        });

        it("should allow model owner developer to create version", async () => {
            const res = await request
                .post(`${testModelId}/versions`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ version: "1.0.0", price: 1000, isPrimary: true });

            if (res.statusCode !== 201) console.log("CREATE VERSION FAIL:", res.body);
            expect(res.statusCode).to.equal(201);
            expect(res.body.data.version).to.have.property("id");
            expect(res.body.data.version.version).to.equal("1.0.0");
            expect(res.body.data.version.isPrimary).to.equal(true);
            versionId = res.body.data.version.id;
        });

        it("should list versions of a model publicly", async () => {
            const res = await request.get(`${testModelId}/versions`);
            expect(res.statusCode).to.equal(200);
            expect(res.body.data.versions).to.be.an("array");
            expect(res.body.data.versions.length).to.be.at.least(1);
        });

        it("should fetch version details publicly", async () => {
            const res = await request.get(`versions/${versionId}`);
            expect(res.statusCode).to.equal(200);
            expect(res.body.data.version.version).to.equal("1.0.0");
        });

        it("should allow model owner to update version metadata", async () => {
            const res = await request
                .patch(`versions/${versionId}`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ price: 1200 });

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.version.price).to.equal(1200);
        });

        it("should allow model owner to toggle version active status", async () => {
            const res = await request
                .patch(`versions/${versionId}/activate`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ isActive: false });

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.version.isActive).to.equal(false);
        });
    });

    describe("Features Management", () => {
        it("should allow owner to create a feature for a version", async () => {
            const res = await request
                .post(`versions/${versionId}/features`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ feature: "Accurate predictions" });

            expect(res.statusCode).to.equal(201);
            expect(res.body.data.feature).to.have.property("id");
            featureId = res.body.data.feature.id;
        });

        it("should list features of a version publicly", async () => {
            const res = await request.get(`versions/${versionId}/features`);
            expect(res.statusCode).to.equal(200);
            expect(res.body.data.features).to.be.an("array");
            expect(res.body.data.features[0].feature).to.equal("Accurate predictions");
        });

        it("should allow owner to update feature", async () => {
            const res = await request
                .patch(`features/${featureId}`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ feature: "Slightly more accurate predictions" });

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.feature.feature).to.equal("Slightly more accurate predictions");
        });
    });

    describe("Metrics Management", () => {
        it("should allow owner to create a metric for a version", async () => {
            const res = await request
                .post(`versions/${versionId}/metrics`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ metric: "F1 Score", value: 0.98, metricsUrl: "http://metrics.org" });

            expect(res.statusCode).to.equal(201);
            expect(res.body.data.metric).to.have.property("id");
            metricId = res.body.data.metric.id;
        });

        it("should list metrics of a version publicly", async () => {
            const res = await request.get(`versions/${versionId}/metrics`);
            expect(res.statusCode).to.equal(200);
            expect(res.body.data.metrics).to.be.an("array");
        });

        it("should allow owner to update metric", async () => {
            const res = await request
                .patch(`metrics/${metricId}`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ value: 0.99 });

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.metric.value).to.equal(0.99);
        });
    });

    describe("Assets Management & Download Validation", () => {
        it("should allow owner to create an asset (download link) for a version", async () => {
            const res = await request
                .post(`versions/${versionId}/assets`)
                .set("Authorization", `Bearer ${developerToken}`)
                .send({ type: "DOWNLOAD_LINK", value: "http://example.com/weights.zip" });

            if (res.statusCode !== 201) console.log("CREATE ASSET FAIL:", res.body);
            expect(res.statusCode).to.equal(201);
            expect(res.body.data.asset).to.have.property("id");
            expect(res.body.data.asset).to.not.have.property("value"); // Should not expose plain text value in API response
            assetId = res.body.data.asset.id;
        });

        it("should allow owner to view asset list", async () => {
            const res = await request
                .get(`versions/${versionId}/assets`)
                .set("Authorization", `Bearer ${developerToken}`);

            expect(res.statusCode).to.equal(200);
            expect(res.body.data.assets).to.be.an("array");
        });

        it("should refuse asset listing to non-owner client", async () => {
            const res = await request
                .get(`versions/${versionId}/assets`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(403);
        });

        it("should refuse download for user without a valid order", async () => {
            const res = await request
                .get(`assets/${assetId}/download`)
                .set("Authorization", `Bearer ${clientToken}`);

            expect(res.statusCode).to.equal(403);
        });

        it("should allow download if client has a paid/delivered order", async () => {
            // Seed a DELIVERED order for this model and client
            const order = await prisma.order.create({
                data: {
                    clientId: "101",
                    developerId: "102",
                    aiModelId: testModelId,
                    versionId,
                    purchasePrice: 1000,
                    stripePaymentIntentId: "pi_test_version_download_1",
                    title: "Test order for download",
                    img: "default.png",
                    status: "DELIVERED"
                }
            });

            const res = await request
                .get(`assets/${assetId}/download`)
                .set("Authorization", `Bearer ${clientToken}`);

            // Expect redirect (302) to the decrypted URL value
            expect(res.statusCode).to.equal(302);
            expect(res.headers.location).to.equal("http://example.com/weights.zip");

            // Clean up order
            await prisma.order.delete({ where: { id: order.id } });
        });
    });
});
