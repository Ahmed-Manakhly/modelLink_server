const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const IV_LENGTH = 16;
const JWT_SECRET = process.env.JWT_SECRET;

if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is required for asset encryption.');
}

if (Buffer.from(ENCRYPTION_KEY, 'utf8').length < 32) {
    throw new Error('ENCRYPTION_KEY must be at least 32 bytes long.');
}

if (!JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required for presigned URL generation.');
}

function encrypt(text) {
    if (!text) return null;
    try {
        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return iv.toString('hex') + ':' + encrypted;
    } catch (err) {
        return null;
    }
}

function decrypt(text) {
    if (!text) return null;
    try {
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY.substring(0, 32)), iv);
        let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (err) {
        return null;
    }
}

function generatePresignedUrl(orderId, assetId, expiresInMinutes = 15) {
    const expires = Date.now() + expiresInMinutes * 60 * 1000;
    const dataToSign = `${orderId}:${assetId}:${expires}`;
    const signature = crypto.createHmac('sha256', JWT_SECRET).update(dataToSign).digest('hex');
    return `/api/orders/${orderId}/assets/${assetId}/download?expires=${expires}&signature=${signature}`;
}

function verifyPresignedUrl(orderId, assetId, expires, signature) {
    if (!expires || !signature) return false;
    const parsedExpires = parseInt(expires, 10);
    if (isNaN(parsedExpires) || Date.now() > parsedExpires) {
        return false; // Expired or invalid format
    }
    const dataToSign = `${orderId}:${assetId}:${expires}`;
    const expectedSignature = crypto.createHmac('sha256', JWT_SECRET).update(dataToSign).digest('hex');
    return signature === expectedSignature;
}

module.exports = { encrypt, decrypt, generatePresignedUrl, verifyPresignedUrl };
