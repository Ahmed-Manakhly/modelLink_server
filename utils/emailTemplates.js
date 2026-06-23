const escapeHtml = (value = '') => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getLogoUrl = () => {
    if (process.env.EMAIL_LOGO_URL) return process.env.EMAIL_LOGO_URL;
    const clientUrl = (process.env.CLIENT_URL || '').replace(/\/+$/, '');
    return clientUrl ? `${clientUrl}/logo.svg` : null;
};

const getBrandHeaderHtml = () => {
    const logoUrl = getLogoUrl();
    const logoBlock = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="ModelLink" height="44" style="display:block;margin:0 auto 8px;max-width:180px;height:auto;" />`
        : '';

    return `
        <div style="background:linear-gradient(135deg,#3665B9 0%,#5DB8DD 100%);padding:28px 24px;text-align:center;border-radius:12px 12px 0 0;">
            ${logoBlock}
            <div style="color:#ffffff;font-size:24px;font-weight:700;letter-spacing:0.4px;font-family:Arial,Helvetica,sans-serif;">ModelLink</div>
            <div style="color:rgba(255,255,255,0.85);font-size:13px;margin-top:6px;font-family:Arial,Helvetica,sans-serif;">AI Model Marketplace</div>
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
</head>
<body style="margin:0;padding:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb;padding:24px 12px;">
        <tr>
            <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(54,101,185,0.12);">
                    <tr><td>${getBrandHeaderHtml()}</td></tr>
                    <tr>
                        <td style="padding:32px 28px;">
                            ${bodyHtml}
                        </td>
                    </tr>
                    <tr>
                        <td style="padding:18px 28px 28px;border-top:1px solid #e5e7eb;background:#fafbfd;">
                            <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;text-align:center;">
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
        <h1 style="margin:0 0 12px;font-size:24px;color:#3665B9;">Verify your email</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;">
            Welcome to ModelLink. Use the one-time code below to continue:
        </p>
        <div style="background:#eef6fb;border:1px solid #cfe8f5;border-radius:10px;padding:20px;text-align:center;margin:0 0 20px;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#3665B9;font-weight:700;margin-bottom:8px;">Verification code</div>
            <div style="font-size:34px;font-weight:700;letter-spacing:8px;color:#111827;">${escapeHtml(otp)}</div>
        </div>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
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
        ? `<tr><td style="padding:8px 0;color:#6b7280;width:140px;">Account</td><td style="padding:8px 0;color:#111827;">Registered user — ${escapeHtml(registeredUser.org_username || registeredUser.email)} (${escapeHtml(registeredUser.role || 'USER')})</td></tr>`
        : `<tr><td style="padding:8px 0;color:#6b7280;width:140px;">Account</td><td style="padding:8px 0;color:#111827;">Guest / not logged in</td></tr>`;

    return wrapEmailLayout({
        title: 'New Support Request',
        preheader: `Support request from ${firstName} ${lastName}`,
        bodyHtml: `
            <h1 style="margin:0 0 12px;font-size:24px;color:#3665B9;">New customer support request</h1>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;">
                A customer submitted the contact form on ModelLink.
            </p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;font-size:14px;">
                <tr><td style="padding:8px 0;color:#6b7280;width:140px;">Name</td><td style="padding:8px 0;color:#111827;">${escapeHtml(firstName)} ${escapeHtml(lastName)}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;">Email</td><td style="padding:8px 0;color:#111827;"><a href="mailto:${escapeHtml(email)}" style="color:#3665B9;">${escapeHtml(email)}</a></td></tr>
                ${accountLine}
            </table>
            <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px;">
                <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#3665B9;font-weight:700;margin-bottom:10px;">Message</div>
                <div style="font-size:15px;line-height:1.7;color:#111827;white-space:pre-wrap;">${escapeHtml(message)}</div>
            </div>
        `,
    });
};

const buildContactSupportReceiptEmailHtml = ({ firstName, messagePreview }) => wrapEmailLayout({
    title: 'Support Request Received',
    preheader: 'We received your message and will get back to you soon.',
    bodyHtml: `
        <h1 style="margin:0 0 12px;font-size:24px;color:#3665B9;">Thanks for contacting us</h1>
        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#4b5563;">
            Hi ${escapeHtml(firstName)}, we received your support request. Our team will review it and respond as soon as possible.
        </p>
        <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;padding:18px;margin:0 0 16px;">
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#3665B9;font-weight:700;margin-bottom:10px;">Your message</div>
            <div style="font-size:14px;line-height:1.7;color:#374151;white-space:pre-wrap;">${escapeHtml(messagePreview)}</div>
        </div>
        <p style="margin:0;font-size:14px;line-height:1.6;color:#6b7280;">
            If this was not you, please contact us at Support@modellink.com.
        </p>
    `,
});

module.exports = {
    escapeHtml,
    wrapEmailLayout,
    buildOtpEmailHtml,
    buildContactSupportAdminEmailHtml,
    buildContactSupportReceiptEmailHtml,
};
