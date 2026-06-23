const createError = require('../utils/createError');
const asyncErrorCatching = require('../utils/asyncErrorCatching');
const prisma = require('../prisma/prisma');
const sendEmail = require('../utils/email');
const { isValidEmail } = require('../utils/passwordEmailChecker');
const {
    buildContactSupportAdminEmailHtml,
    buildContactSupportReceiptEmailHtml,
} = require('../utils/emailTemplates');
const logger = require('../utils/logger');

const getSupportInbox = () =>
    process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || process.env.SMTP_EMAIL;

const trimField = (value, maxLength) => {
    if (typeof value !== 'string') return '';
    return value.trim().slice(0, maxLength);
};

exports.submitContact = asyncErrorCatching(async (req, res, next) => {
    const firstName = trimField(req.body.firstName, 80);
    const lastName = trimField(req.body.lastName, 80);
    const email = trimField(req.body.email, 254).toLowerCase();
    const message = trimField(req.body.message, 5000);

    if (!firstName || !lastName) {
        return next(new createError(400, 'First name and last name are required.'));
    }
    if (!email || !isValidEmail(email)) {
        return next(new createError(400, 'A valid email address is required.'));
    }
    if (!message || message.length < 10) {
        return next(new createError(400, 'Message must be at least 10 characters.'));
    }

    const supportInbox = getSupportInbox();
    if (!supportInbox) {
        logger.error('Support contact failed: no SUPPORT_EMAIL, ADMIN_EMAIL, or SMTP_EMAIL configured');
        return next(new createError(503, 'Support email is not configured.'));
    }

    let registeredUser = null;
    if (req.user?.id) {
        registeredUser = await prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                org_username: true,
                role: true,
                first_name: true,
                last_name: true,
            },
        });
    } else {
        registeredUser = await prisma.user.findFirst({
            where: { email, deletedAt: null },
            select: {
                id: true,
                email: true,
                org_username: true,
                role: true,
                first_name: true,
                last_name: true,
            },
        });
    }

    const adminSubject = `[ModelLink Support] ${firstName} ${lastName}`;
    const adminPlainText = [
        'New customer support request',
        '',
        `Name: ${firstName} ${lastName}`,
        `Email: ${email}`,
        registeredUser
            ? `Account: ${registeredUser.org_username || registeredUser.email} (${registeredUser.role})`
            : 'Account: Guest / not logged in',
        '',
        'Message:',
        message,
    ].join('\n');

    await sendEmail({
        email: supportInbox,
        subject: adminSubject,
        emailTemplate: buildContactSupportAdminEmailHtml({
            firstName,
            lastName,
            email,
            message,
            registeredUser,
        }),
        message: adminPlainText,
        replyTo: email,
    });

    await sendEmail({
        email,
        subject: 'We received your message — ModelLink Support',
        emailTemplate: buildContactSupportReceiptEmailHtml({
            firstName,
            messagePreview: message.length > 280 ? `${message.slice(0, 280)}…` : message,
        }),
        message: `Hi ${firstName},\n\nWe received your support request and will respond soon.\n\nYour message:\n${message}`,
    });

    // TODO: optional admin chat message for registered users (requires staff conversation routing).

    logger.info('Support contact form submitted', {
        email,
        registeredUserId: registeredUser?.id || null,
        supportInbox,
    });

    res.status(201).json({
        status: 'success',
        message: 'Your message was sent successfully. We will get back to you soon.',
    });
});
