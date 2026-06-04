#!/bin/sh
set -e

# Ensure public and uploads directories exist and have correct ownership
mkdir -p /public
mkdir -p /public/users
mkdir -p /public/tmp
mkdir -p /app/uploads
mkdir -p /logs

# Set ownership to the non-root app user (UID 1001)
# chown -R 1001:1001 /public /app/uploads || true
# chmod -R 755 /public /app/uploads || true

if [ "$NODE_ENV" = "docker_development" ]; then
    # LOCAL DEV: We use bind mounts. Grant broad permissions so both Native Node (1000) and Docker (1001) can read/write/delete.
    chmod -R 777 /public /logs /app/uploads || true
else
    # PRODUCTION: We use named volumes. Enforce strict security ownership and permissions.
    chown -R modelLink:modelLink /public /logs /app/uploads || true
    chmod -R 755 /public /logs /app/uploads || true
fi


# Run migrations / prisma tasks could be handled inside app; start the app
# Drop privileges and run the app as the modelLink user
exec su-exec modelLink "$@"
