require('dotenv').config();
const superTest = require("supertest");
const expect = require("chai").expect;
const errorMessages = require("../utils/errorMessages");
const reviewRequest = superTest("http://localhost:8000/api/reviews/");
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const jwt = require('jsonwebtoken');

describe("Reviews", () => {

    let clientToken;
    let developerToken;

    let reviewData = {
        "aiModelId": 4,
        "orderId": 6,
        "desc": "test desc",
        "star": 4
    }
    let id;

    before(async () => {
        // 1. Ensure Client (id: "12") and Developer (id: "13") users exist in DB
        const hashedPassword = await require('bcrypt').hash("Password123!", 10);

        await prisma.user.upsert({
            where: { id: "12" },
            update: { isActive: true },
            create: {
                id: "12",
                customId: "USR-00000000000012",
                email: "client12@modellink.com",
                org_username: "client12",
                password: hashedPassword,
                role: "CLIENT",
                isActive: true
            }
        });

        await prisma.user.upsert({
            where: { id: "13" },
            update: { isActive: true },
            create: {
                id: "13",
                customId: "USR-00000000000013",
                email: "dev13@modellink.com",
                org_username: "dev13",
                password: hashedPassword,
                role: "DEVELOPER",
                isActive: true
            }
        });

        // 2. Ensure AiModel (id: 4) exists
        await prisma.aiModel.upsert({
            where: { id: 4 },
            update: {},
            create: {
                id: 4,
                title: "Test AI Model",
                category: "Diagnostics",
                desc: "Test Description",
                developerId: "13"
            }
        });

        // 3. Ensure AiModelVersion (id: 1) exists
        await prisma.aiModelVersion.upsert({
            where: { id: 1 },
            update: {},
            create: {
                id: 1,
                version: "1.0.0",
                price: 1000,
                aiModelId: 4
            }
        });

        // 4. Ensure Order (id: 6) exists
        await prisma.order.upsert({
            where: { id: 6 },
            update: {},
            create: {
                id: 6,
                clientId: "12",
                developerId: "13",
                aiModelId: 4,
                versionId: 1,
                purchasePrice: 1000,
                stripePaymentIntentId: "pi_test_review_order_6",
                title: "Test AI Model Order",
                img: "default.png",
                status: "DELIVERED"
            }
        });

        // 5. Clean up any existing review for orderId 6 so that createReview passes
        await prisma.review.deleteMany({
            where: { orderId: 6 }
        });

        // 6. Sign fresh JWT tokens that will not expire
        const secret = process.env.ACCESS_SECRET_STR || 'AD7-FGH-HUKYUK111ddd-2545-aSDA@ER-UKY11125UKddd-2545-aSDA@ER';
        clientToken = jwt.sign({ id: "12", role: "CLIENT" }, secret, { expiresIn: '1d' });
        developerToken = jwt.sign({ id: "13", role: "DEVELOPER" }, secret, { expiresIn: '1d' });
    });

    after(async () => {
        await prisma.$disconnect();
    });

    describe("POST", () => {

        describe("Client", () => {
            it('/ create review', () => {
                return reviewRequest
                    .post("/")
                    .set("Authorization", `Bearer ${clientToken}`)
                    .send(reviewData)
                    .then((response) => {
                        expect(response.statusCode).to.equal(201);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("success");
                        expect(response.body).to.have.property("data");
                        expect(response.body.data).to.have.property("review");
                        id = response.body.data.review.id;
                    })
            });

            it('/ should fail to create duplicate review for same aiModelId and clientId', async () => {
                // Seed a second order for the same client and model
                await prisma.order.upsert({
                    where: { id: 7 },
                    update: {},
                    create: {
                        id: 7,
                        clientId: "12",
                        developerId: "13",
                        aiModelId: 4,
                        versionId: 1,
                        purchasePrice: 1000,
                        stripePaymentIntentId: "pi_test_review_order_7",
                        title: "Test AI Model Order 2",
                        img: "default.png",
                        status: "DELIVERED"
                    }
                });

                const res = await reviewRequest
                    .post("/")
                    .set("Authorization", `Bearer ${clientToken}`)
                    .send({
                        "aiModelId": 4,
                        "orderId": 7,
                        "desc": "another review attempt",
                        "star": 5
                    });

                expect(res.statusCode).to.equal(403);
                expect(res.body.status).to.equal("fail");
                expect(res.body.message).to.equal(errorMessages.ONLY_ONE_REVIEW_PER_MODEL);

                // Clean up order 7
                await prisma.order.deleteMany({ where: { id: 7 } });
            });
        })

        describe("Developer", () => {
            it('/ create review', () => {
                return reviewRequest
                    .post("/")
                    .set("Authorization", `Bearer ${developerToken}`)
                    .send(reviewData)
                    .then((response) => {
                        expect(response.statusCode).to.equal(403);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW);
                    })
            });
        })
    })

    describe("GET", () => {

        describe("Client", () => {
            it('/ all reviews', () => {
                return reviewRequest
                    .get("/")
                    .set("Authorization", `Bearer ${clientToken}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("success");
                        expect(response.body).to.have.property("data");
                        expect(response.body.data).to.have.property("reviews");
                    })
            })

            it('/:id  review by id', () => {
                return reviewRequest
                    .get(`/${id}`)
                    .set("Authorization", `Bearer ${clientToken}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("success");
                        expect(response.body).to.have.property("data");
                        expect(response.body.data).to.have.property("review");
                    })
            });
        })

        describe("Developer", () => {
            it('/ get all reviews', () => {
                return reviewRequest
                    .get("/")
                    .set("Authorization", `Bearer ${developerToken}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("success");
                        expect(response.body).to.have.property("data");
                        expect(response.body.data).to.have.property("reviews");
                    })
            })

            it('/:id get a review by id', () => {
                return reviewRequest
                    .get(`/${id}`)
                    .set("Authorization", `Bearer ${developerToken}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("success");
                        expect(response.body).to.have.property("data");
                        expect(response.body.data).to.have.property("review");
                    })
            })
        })
    })

    describe("PATCH", () => {

        describe("Client", () => {
            it('/:id update review', () => {
                return reviewRequest
                    .patch(`/${id}`)
                    .set("Authorization", `Bearer ${clientToken}`)
                    .send({
                        "desc": "updated desc",
                        "star": 5
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("success");
                        expect(response.body).to.have.property("data");
                        expect(response.body.data.review).to.deep.include({
                            "desc": "updated desc",
                            "star": 5
                        });
                    })
            });
        })

        describe("Developer", () => {
            it('/:id update review', () => {
                return reviewRequest
                    .patch(`/${id}`)
                    .set("Authorization", `Bearer ${developerToken}`)
                    .send({
                        "desc": "updated desc",
                        "star": 5
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(403);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW);
                    })
            });
        })

    })

    describe("DELETE", () => {

        describe("Developer", () => {
            it('/:id delete review', () => {
                return reviewRequest
                    .delete(`/${id}`)
                    .set("Authorization", `Bearer ${developerToken}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(403);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.ONLY_CUSTOMERS_CAN_CREATE_REVIEW);
                    })
            });
        })

        describe("Client", () => {
            it('/:id delete review', () => {
                return reviewRequest
                    .delete(`/${id}`)
                    .set("Authorization", `Bearer ${clientToken}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(204);
                    })
            });

        })
    })
})
