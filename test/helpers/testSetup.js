require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:8000';
const JWT_SECRET = process.env.ACCESS_SECRET_STR;

const DEFAULT_PASSWORD = 'Password123!';

async function hashPassword(password = DEFAULT_PASSWORD) {
    return bcrypt.hash(password, 10);
}

async function seedUser({ id, email, org_username, role, customId }) {
    const password = await hashPassword();
    return prisma.user.upsert({
        where: { id },
        update: { isActive: true, failed_attempts: 0, lockup: null },
        create: {
            id,
            customId: customId || `USR-TEST-${id}`,
            email,
            org_username,
            password,
            role,
            isActive: true,
        },
    });
}

function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
}

function authHeader(token) {
    return { Authorization: `Bearer ${token}` };
}

module.exports = {
    prisma,
    BASE_URL,
    DEFAULT_PASSWORD,
    hashPassword,
    seedUser,
    signToken,
    authHeader,
};
