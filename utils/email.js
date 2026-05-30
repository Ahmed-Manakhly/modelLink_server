const nodemailer = require('nodemailer');
const logger = require('./logger');

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
    try {
        const mailOptions = {
            from: `"ModelLink Platform" <${process.env.SMTP_EMAIL}>`,
            to: options.email,
            subject: options.subject,
            html: options.emailTemplate,
            text: options.message
        };

        await transporter.sendMail(mailOptions);
        logger.info(`Email sent successfully to ${options.email}`);
    } catch (error) {
        logger.error(`Error sending email to ${options.email}`, { error: error.message, stack: error.stack });
        throw error;
    }
};

module.exports = sendEmail;
