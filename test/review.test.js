const superTest = require("supertest");
const expect = require("chai").expect;
const errorMessages = require("../utils/errorMessages");
const reviewRequest = superTest("http://localhost:8000/api/reviews/");


describe("Reviews", () => {

    let clientToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTIsInJvbGUiOiJDTElFTlQiLCJpYXQiOjE3MDM5MDQ2MzEsImV4cCI6MTcxMTY4MDYzMX0.wfOZVBHh2wClIkC_CbhWIIYlC88jTdUI4hI8NukHvKA";
    let developerToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MTMsInJvbGUiOiJERVZFTE9QRVIiLCJpYXQiOjE3MDM4MTI3OTgsImV4cCI6MTcxMTU4ODc5OH0.mEuQAlr1nxcz3LMDMNI3RmRmTykEOF-2MuA4BhJQbzI";

    let reviewData = {
        "aiModelId": 4,
        "orderId": 6,
        "desc": "test desc",
        "star": 4
    }
    let id;


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
