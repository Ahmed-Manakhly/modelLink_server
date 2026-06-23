const jwt = require('jsonwebtoken');
const util = require('util');
const prisma = require('../prisma/prisma');
const asyncErrorCatching = require('../utils/asyncErrorCatching');

/** Attach req.user when a valid token is present; continue anonymously otherwise. */
exports.optionalProtect = asyncErrorCatching(async (req, res, next) => {
    let token = null;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.jwt) {
        token = req.cookies.jwt;
    }

    if (!token || token === 'null' || token === 'undefined') {
        return next();
    }

    try {
        const decoded = await util.promisify(jwt.verify)(token, process.env.ACCESS_SECRET_STR);
        const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: {
                id: true,
                email: true,
                org_username: true,
                role: true,
                isActive: true,
                deletedAt: true,
            },
        });

        if (user && user.isActive && !user.deletedAt) {
            req.user = user;
        }
    } catch (_) {
        // Ignore invalid/expired tokens for public endpoints.
    }

    next();
});
