const multer = require('multer');
const path = require('path');
const fs = require('fs');
const createError = require('./createError');
const asyncErrorCatching = require('./asyncErrorCatching');
// ===============================================
// Get public directory from environment that assigned by the server
const publicDir = process.env.PUBLIC_DIR;
// ===============================================
// Middleware generator with dynamic fields
exports.uploadingFiles = (folder, fields) => asyncErrorCatching(async (req, res, next) => {
    // Validate folder name
    if (!folder || typeof folder !== 'string') {
        return next(new createError(400, 'Invalid upload folder specified'));
    }
    // Create storage configuration
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            const destPath = path.join(publicDir, folder);
            // Create folder if it doesn't exist
            if (!fs.existsSync(destPath)) {
                fs.mkdirSync(destPath, { recursive: true });
            }
            cb(null, publicDir);
        },
        filename: (req, file, cb) => cb(null, path.join(folder, Date.now() + "_" + file.originalname))
    });
    const upload = multer({
        storage,
        limits: {
            fileSize: 100 * 1024 * 1024, // 100MB limit for heavy files
            files: 20 // Maximum 20 files
        },
        fileFilter: (req, file, cb) => {
            const allowedTypes = [
                'image/jpeg',
                'image/png',
                'image/gif',
                'image/webp',
                'image/tiff',
                'image/bmp',
                'application/pdf',
                'application/msword',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'application/vnd.ms-powerpoint',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                'application/zip',
                'application/x-rar-compressed',
                'application/x-7z-compressed',
                'video/mp4',
                'video/avi',
                'video/mov',
                'video/wmv',
                'video/x-ms-wmv',
                'video/quicktime',
                'video/x-msvideo',
                'audio/mp3',
                'audio/wav',
                'audio/mpeg',
                'application/x-shockwave-flash',
                'application/octet-stream'
            ];

            if (allowedTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new createError(400, `Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`), false);
            }
        }
    });
    await new Promise((resolve, reject) => {
        upload.fields(fields)(req, res, (err) => {
            if (err) {
                let message = 'File upload failed';
                if (err.code === 'LIMIT_UNEXPECTED_FILE') message = 'Unexpected file field';
                if (err.code === 'LIMIT_FILE_SIZE') message = 'File too large';
                if (err.code === 'ENOENT') message = 'Directory creation failed';
                return reject(new createError(400, `${message}: ${err.message}`));
            }
            resolve();
        });
    });
    next();
});
