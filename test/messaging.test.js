require('dotenv').config();
const superTest = require('supertest');
const { expect } = require('chai');
const { prisma, BASE_URL, seedUser, signToken, authHeader } = require('./helpers/testSetup');

const conversationRequest = superTest(`${BASE_URL}/api/conversations/`);
const messageRequest = superTest(`${BASE_URL}/api/messages/`);

describe('Conversation & message API', () => {
    const clientId = '541';
    const devId = '542';
    let clientToken;
    let devToken;
    let conversationId;

    before(async () => {
        await seedUser({
            id: clientId,
            email: 'bechat541@modellink.test',
            org_username: 'bechat541',
            role: 'CLIENT',
        });
        await seedUser({
            id: devId,
            email: 'bechat542@modellink.test',
            org_username: 'bechat542',
            role: 'DEVELOPER',
        });

        clientToken = signToken({ id: clientId, role: 'CLIENT' });
        devToken = signToken({ id: devId, role: 'DEVELOPER' });

        await prisma.message.deleteMany({
            where: { Conversation: { participants: { some: { userId: { in: [clientId, devId] } } } } },
        });
        await prisma.conversationParticipant.deleteMany({
            where: { userId: { in: [clientId, devId] } },
        });
        await prisma.conversation.deleteMany({
            where: {
                OR: [
                    { participants: { some: { userId: clientId } } },
                    { participants: { some: { userId: devId } } },
                ],
            },
        });
    });

    after(async () => {
        if (conversationId) {
            await prisma.message.deleteMany({ where: { conversationId } });
            await prisma.conversationParticipant.deleteMany({ where: { conversationId } });
            await prisma.conversation.deleteMany({ where: { id: conversationId } });
        }
        await prisma.user.deleteMany({ where: { id: { in: [clientId, devId] } } });
        await prisma.$disconnect();
    });

    it('POST /conversations creates client-developer conversation', async () => {
        const res = await conversationRequest
            .post('')
            .set(authHeader(clientToken))
            .send({ clientId, developerId: devId });

        expect(res.statusCode).to.equal(201);
        expect(res.body.data.conversation).to.have.property('id');
        conversationId = res.body.data.conversation.id;
    });

    it('GET /conversations/:id lists user conversations', async () => {
        const res = await conversationRequest
            .get(clientId)
            .set(authHeader(clientToken));

        expect(res.statusCode).to.equal(200);
        expect(res.body.data.chats).to.be.an('array');
        expect(res.body.data.chats.some((c) => c.id === conversationId)).to.equal(true);
    });

    it('POST /messages sends message in conversation', async () => {
        const res = await messageRequest
            .post('')
            .set(authHeader(clientToken))
            .send({
                conversationId,
                desc: 'Hello developer, I have a question about your model.',
            });

        expect(res.statusCode).to.equal(201);
        expect(res.body.data.newMsg.desc).to.include('Hello developer');
    });

    it('GET /messages/:id returns conversation messages', async () => {
        const res = await messageRequest
            .get(String(conversationId))
            .set(authHeader(devToken));

        expect(res.statusCode).to.equal(200);
        expect(res.body.data.messages).to.be.an('array');
        expect(res.body.data.messages.length).to.be.at.least(1);
    });
});
