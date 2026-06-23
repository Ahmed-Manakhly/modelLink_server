const superTest = require("supertest");
const expect = require("chai").expect;
const errorMessages = require("../utils/errorMessages");
const authRequest = superTest("http://localhost:8000/api/auth/");

/**
 * @description Authentication API testing
 */
describe("Authentication", () => {

    let randomNum = Math.floor(Math.random() * 9999);
    let userData = {
        "email": `ibrahim${randomNum}@neureveal.com`,
        "org_username": `1brahim${randomNum}`,
        "org_phone": `01000000000${randomNum}`,
        "org_name": `Neureveal${randomNum}`,
        "org_desc" : `Test desc for Neureveal${randomNum}`,
        "role": `${randomNum % 2 === 0 ? "CLIENT" : "DEVELOPER"}`
    }

    let userPasswordData = {
        password: "Neurevealaccpass1@",
        passwordConfirm: "Neurevealaccpass1@"
    }

    let token;

    describe("Register", () => {

        describe("Negative Testing", () => {
            it('/register - Not Complex Password', () => {
                return authRequest
                    .post("register")
                    .send({
                        ...userData,
                        ...userPasswordData,
                        password: "Neurevealaass1",
                        passwordConfirm: "Neurevealaass1"
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(400);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.INVALID_PASSWORD);
                    })
            });

            it('/register - Passwords do not match', () => {
                return authRequest
                    .post("register")
                    .send({
                        ...userData,
                        ...userPasswordData,
                        password: "Neurevealapass1@",
                        passwordConfirm: "Neurevealapass2@"
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(400);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.PASSWORDS_DO_NOT_MATCH);
                    })
            });

            it('/register - Credentials is required', async () => {

                await authRequest
                    .post("register")
                    .send({
                        ...userData,
                        ...userPasswordData,
                        email: null,
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(400);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.EMAIL_USERNAME_PASSWORD_REQUIRED);
                    })

                await authRequest
                    .post("register")
                    .send({
                        ...userData,
                        ...userPasswordData,
                        org_username: null,
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(400);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.EMAIL_USERNAME_PASSWORD_REQUIRED);
                    })

                await authRequest
                    .post("register")
                    .send({
                        ...userData,
                        ...userPasswordData,
                        password: null,
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(400);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.EMAIL_USERNAME_PASSWORD_REQUIRED);
                    })
            });

            it('/register - Admin not allowed', () => {
                return authRequest
                    .post("register")
                    .send({
                        ...userData,
                        ...userPasswordData,
                        role: "admin",
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(400);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.ADMIN_ROLE_NOT_ALLOWED);
                    })
            });
        });

        describe("Positive Testing", () => {
            it("/register", async () => {
                return authRequest
                    .post("register")
                    .send({
                        ...userData,
                        ...userPasswordData,
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(201);
                        expect(response.body).to.have.property("data");
                        expect(response.body).to.have.property("token");
                        expect(response.body.data).to.have.property("user");
                        expect(response.body.data.user).to.deep.include(userData);
                    })
            });
        });
    });

    describe("Login", () => {

        describe("Positive Testing", () => {

            it("/login", async () => {
                return authRequest
                    .post("login")
                    .send({
                        org_username: userData.org_username,
                        password: userPasswordData.password,
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.headers).to.have.property("set-cookie");

                        expect(response.body).to.have.property("data");
                        expect(response.body.data).to.have.property("user");
                        expect(response.body.data.user).to.deep.include(userData);

                        expect(response.body).to.have.property("token");
                        token = response.body.token;
                    })
            });

            it("/me - Authenticated", async () => {
                return authRequest
                    .get("me")
                    .set("Authorization", `Bearer ${token}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.body).to.have.property("data");
                        expect(response.body.data).to.have.property("user");
                        expect(response.body.data.user).to.deep.include(userData);
                    })
            });

            it("/logout - Authenticated", async () => {
                return authRequest
                    .post("logout")
                    .set("Authorization", `Bearer ${token}`)
                    .then((response) => {
                        expect(response.statusCode).to.equal(200);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("success");
                    })
            });

        });

        describe("Negative Testing", () => {

            it('/login - Wrong org_username', () => {
                return authRequest
                    .post("login")
                    .send({
                        org_username: "wrongorg_username",
                        password: userPasswordData.password,
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(401);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.INVALID_CREDENTIALS);
                    })
            });

            it('/login close account on 10 failed attempts', async () => {

                for (let i = 0; i < 10; i++) {
                    await authRequest
                        .post("login")
                        .send({
                            org_username: userData.org_username,
                            password: "wrongpassword",
                        })
                }

                return authRequest
                    .post("login")
                    .send({
                        org_username: userData.org_username,
                        password: "wrongpassword",
                    })
                    .then((response) => {
                        expect(response.statusCode).to.equal(401);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.ACCOUNT_LOCKED);
                    })
            });
        });
    });

    describe("Me", () => {

        describe("Negative Testing", () => {
            it("/me - Not Authorized", async () => {
                return authRequest
                    .get("me")
                    .then((response) => {
                        expect(response.statusCode).to.equal(401);
                        expect(response.body).to.have.property("status");
                        expect(response.body.status).to.equal("fail");
                        expect(response.body.message).to.equal(errorMessages.NOT_LOGGED_IN);
                    })
            });
        });

    });

});
