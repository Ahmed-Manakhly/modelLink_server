const nodemailer = require('nodemailer');
const logger = require('./logger');
const { isMarketplaceDemo } = require('./marketplaceDemo');

const shouldSkipEmailSend = () =>
    process.env.EMAIL_SEND_DISABLED === 'true'
    || isMarketplaceDemo()
    || process.env.NODE_ENV === 'test'
    || !process.env.SMTP_EMAIL
    || !process.env.SMTP_PASSWORD;

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: true,
    auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD
    },
    tls: {
        rejectUnauthorized: false
    }
});

const sendEmail = async (options) => {
    if (shouldSkipEmailSend()) {
        logger.info(`Email skipped (demo/no SMTP): to=${options.email} subject="${options.subject}"`);
        return;
    }

    try {
        const mailOptions = {
            from: `"ModelLink Platform" <${process.env.SMTP_EMAIL}>`,
            to: options.email,
            subject: options.subject,
            html: options.emailTemplate,
            text: options.message,
        };

        if (options.replyTo) {
            mailOptions.replyTo = options.replyTo;
        }

        await transporter.sendMail(mailOptions);
        logger.info(`Email sent successfully to ${options.email}`);
    } catch (error) {
        logger.error(`Error sending email to ${options.email}`, { error: error.message, stack: error.stack });
        throw error;
    }
};

module.exports = sendEmail;
