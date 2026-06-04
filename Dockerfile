# Backend Dockerfile for modelLink API
FROM node:24-alpine

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    openssl \
    && rm -rf /var/cache/apk/*
# Install su-exec to allow dropping privileges from entrypoint
RUN apk add --no-cache su-exec dos2unix

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies for Prisma CLI)
RUN npm ci && npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Create uploads directory
RUN mkdir -p uploads && chmod 755 uploads

# Create public directory for user uploads (named volume will be mounted here)
RUN mkdir -p /public && chmod 755 /public


# FOR LOGGER
RUN mkdir -p /logs && chmod 755 /logs
# RUN mkdir -p logs && chown -R node:node logs

# Create non-root user
RUN addgroup -g 1001 -S modelLink && \
    adduser -S modelLink -u 1001 -G modelLink

# Change ownership of the app directory
# RUN chown -R nextjs:nodejs /app /public
RUN chown -R modelLink:modelLink /app /public /logs

# Fix line endings and set execute permission for entrypoint
RUN dos2unix /app/entrypoint.sh || sed -i 's/\r$//' /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Do not switch to non-root here; entrypoint will drop privileges after preparing directories
USER root

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node healthcheck.js || exit 1

# Start the application via entrypoint which will drop to the app user
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["npm", "start"]
