const prisma = require('../prisma/prisma');
const bcrypt = require('bcrypt');
const { UserRole } = require('@prisma/client');
const { execSync } = require('child_process');
const { isComplexPassword, isValidEmail } = require('./passwordEmailChecker');
const logger = require('./logger');

/**
 * Push Prisma schema to database (creates schema from schema.prisma)
 * This is used instead of migrations for fresh database setup
 */
const pushSchema = async () => {
    try {
        logger.info('🔄 Pushing database schema from schema.prisma...');

        // Legacy routing (kept for reference):
        /*
        const DB_URL = process.env.NODE_ENV === 'production' 
            ? process.env.DATABASE_URL 
            : process.env.DEV_DATABASE_URL;
        */

        execSync('npx prisma db push --accept-data-loss', {
            stdio: 'inherit',
            cwd: process.cwd(),
            // To restore legacy routing, change env to: { ...process.env, DATABASE_URL: DB_URL }
            env: process.env
        });
        logger.info('✅ Database schema created successfully!');
        return true;
    } catch (error) {
        logger.error(error, '❌ Schema push failed');
        throw error;
    }
};

/**
 * Ensure admin user exists in the database
 */
const ensureAdminUser = async () => {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'System Admin';

    // Validate environment variables
    if (!adminEmail || !adminPassword) {
        logger.warn('⚠️ ADMIN_EMAIL or ADMIN_PASSWORD not set. Skipping admin user bootstrap.');
        return;
    }

    // Validate email format
    if (!isValidEmail(adminEmail.toLowerCase())) {
        logger.warn(`ADMIN_EMAIL "${adminEmail}" is not a valid Model Link email. Skipping admin user bootstrap.`);
        return;
    }

    // Validate password complexity
    if (!isComplexPassword(adminPassword)) {
        logger.warn('ADMIN_PASSWORD does not meet complexity requirements. Skipping admin user bootstrap.');
        return;
    }

    try {
        // Check if admin user already exists
        const existingAdmin = await prisma.user.findFirst({
            where: {
                role: UserRole.ADMIN,
                email: adminEmail.toLowerCase()
            }
        });

        if (existingAdmin) {
            logger.info('Admin user already exists. Skipping creation.');
            return;
        }

        // Check if any admin exists (to avoid creating duplicates)
        const anyAdmin = await prisma.user.findFirst({
            where: { role: UserRole.ADMIN }
        });

        if (anyAdmin) {
            logger.info('An admin user already exists. Skipping creation.');
            return;
        }

        // Create admin user
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        const createCustomIds = require('./createCustomIds');
        const customId = createCustomIds('ADMIN');
        
        const adminUser = await prisma.user.create({
            data: {
                customId,
                email: adminEmail.toLowerCase(),
                org_username: adminEmail.split('@')[0],
                password: passwordHash,
                first_name: adminName,
                last_name: 'Admin',
                role: UserRole.ADMIN,
                isActive: true
            }
        });

        logger.info(`Admin user created successfully: ${adminUser.email}`);
    } catch (error) {
        // If it's a unique constraint error, user might have been created by another process
        if (error.code === 'P2002') {
            logger.info('Admin user already exists (created by another process).');
            return;
        }
        logger.error(error, 'Failed to create admin user');
        throw error;
    }
};

/**
 * Bootstrap the application (push schema and ensure dev user)
 */
const bootstrap = async () => {
    try {
        // Step 1: Push schema to database (creates tables from schema.prisma)
        await pushSchema();

        // Step 2: Ensure admin user exists
        await ensureAdminUser();

        logger.info('Bootstrap completed successfully!');
    } catch (error) {
        logger.error(error, 'Bootstrap failed');
        throw error;
    }
};

module.exports = { bootstrap, pushSchema, ensureAdminUser };