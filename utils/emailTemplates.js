const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getLogoUrl = () => {
    if (process.env.EMAIL_LOGO_URL) return process.env.EMAIL_LOGO_URL;
    const isDev = process.env.NODE_ENV !== 'production';
    const base = isDev
        ? (process.env.CLIENT_URL_LOCAL || 'http://127.0.0.1:3000')
        : (process.env.CLIENT_URL || 'https://www.modellink.com');
    const clientUrl = base.replace(/\/+$/, '');
    return clientUrl ? `${clientUrl}/favicon.svg` : null;
};

const getBrandHeaderHtml = () => {
    const logoUrl = getLogoUrl();
    const logoBlock = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="ModelLink" height="44" style="display:block;margin:0 auto 8px;max-width:180px;height:auto;" />`
        : '';

    return `
        <div style="background:linear-gradient(135deg, #132730 0%, #09090b 100%);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;border-bottom:1px solid rgba(34, 211, 238, 0.2);">
            ${logoBlock}
            <div style="font-size:26px;font-weight:700;letter-spacing:-0.05em;font-family:'Poppins',Arial,Helvetica,sans-serif;color:#e2e2e8;margin-bottom:4px;">
                Model<span style="color:#22d3ee;">Link</span>
            </div>
            <div style="color:#a1a1aa;font-size:13px;font-family:'Poppins',Arial,Helvetica,sans-serif;">AI Model Marketplace</div>
        </div>
    `;
};

const wrapEmailLayout = ({ title, bodyHtml, preheader = '' }) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <!-- Import Poppins font for supported email clients -->
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap');
    </style>
</head>
<body style="margin:0;padding:0;background:#eeeeee;font-family:'Poppins',Arial,Helvetica,sans-serif;color:#e4e4e7;">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eeeeee;padding:32px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#09090b;border:1px solid #27272a;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.1);">
                    <tr><td>${getBrandHeaderHtml()}</td></tr>
                    <tr>
                        <td style="padding:32px 28px;">
                            ${bodyHtml}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:18px 28px 28px;border-top:1px solid #27272a;background:#09090b;">
                            <p style="margin:0;font-size:12px;line-height:1.6;color:#71717a;text-align:center;font-family:'Poppins',Arial,Helvetica,sans-serif;">
                                © ${new Date().getFullYear()} ModelLink. This is an automated message — please do not reply directly unless instructed.
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
`;

const buildOtpEmailHtml = ({ otp, expiresMinutes }) => wrapEmailLayout({
    title: 'Verify Your Email',
    preheader: `Your ModelLink verification code is ${otp}`,
    bodyHtml: `
        <h1 style="margin:0 0 12px;font-size:24px;color:#f4f4f5;">Verify your email</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#a1a1aa;">
            Welcome to ModelLink. Use the one-time code below to continue:
        </p>
        <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:20px;text-align:center;margin:0 0 20px;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#71717a;font-weight:700;margin-bottom:8px;">Verification code</div>
            <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#f4f4f5;">${escapeHtml(otp)}</div>
        </div>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#71717a;">
            This code expires in <strong>${escapeHtml(String(expiresMinutes))} minutes</strong>.
            If you did not request this, you can safely ignore this email.
        </p>
    `,
});

const buildContactSupportAdminEmailHtml = ({
    firstName,
    lastName,
    email,
    message,
    registeredUser,
}) => {
    const accountLine = registeredUser
        ? `<tr><td style="padding:8px 0;color:#71717a;width:140px;">Account</td><td style="padding:8px 0;color:#e4e4e7;">Registered user — ${escapeHtml(registeredUser.org_username || registeredUser.email)} (${escapeHtml(registeredUser.role || 'USER')})</td></tr>`
        : `<tr><td style="padding:8px 0;color:#71717a;width:140px;">Account</td><td style="padding:8px 0;color:#e4e4e7;">Guest / not logged in</td></tr>`;

    return wrapEmailLayout({
        title: 'New Support Request',
        preheader: `Support request from ${firstName} ${lastName}`,
        bodyHtml: `
            <h1 style="margin:0 0 12px;font-size:24px;color:#f4f4f5;">New customer support request</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#a1a1aa;">
                A customer submitted the contact form on ModelLink.
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;font-size:14px;">
                <tr><td style="padding:8px 0;color:#71717a;width:140px;">Name</td><td style="padding:8px 0;color:#e4e4e7;">${escapeHtml(firstName)} ${escapeHtml(lastName)}</td></tr>
                <tr><td style="padding:8px 0;color:#71717a;">Email</td><td style="padding:8px 0;color:#e4e4e7;"><a href="mailto:${escapeHtml(email)}" style="color:#60a5fa;">${escapeHtml(email)}</a></td></tr>
                ${accountLine}
            </table>
            <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:18px;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#71717a;font-weight:700;margin-bottom:10px;">Message</div>
                <div style="font-size:15px;line-height:1.7;color:#e4e4e7;white-space:pre-wrap;">${escapeHtml(message)}</div>
            </div>
        `,
    });
};

const buildContactSupportReceiptEmailHtml = ({ firstName, messagePreview }) => {
    const supportEmail = process.env.SMTP_EMAIL || 'support@modellink.com';
    return wrapEmailLayout({
        title: 'Support Request Received',
        preheader: 'We received your message and will get back to you soon.',
        bodyHtml: `
            <h1 style="margin:0 0 12px;font-size:24px;color:#f4f4f5;">Thanks for contacting us</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#a1a1aa;">
                Hi ${escapeHtml(firstName)}, we received your support request. Our team will review it and respond as soon as possible.
            </p>
            <div style="background:#18181b;border:1px solid #27272a;border-radius:10px;padding:18px;margin:0 0 16px;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#71717a;font-weight:700;margin-bottom:10px;">Your message</div>
                <div style="font-size:14px;line-height:1.7;color:#d4d4d8;white-space:pre-wrap;">${escapeHtml(messagePreview)}</div>
            </div>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#71717a;">
                If this was not you, please contact us at <a href="mailto:${escapeHtml(supportEmail)}" style="color:#60a5fa;">${escapeHtml(supportEmail)}</a>.
            </p>
        `,
    });
};

module.exports = {
    escapeHtml,
    wrapEmailLayout,
    buildOtpEmailHtml,
    buildContactSupportAdminEmailHtml,
    buildContactSupportReceiptEmailHtml,
};
