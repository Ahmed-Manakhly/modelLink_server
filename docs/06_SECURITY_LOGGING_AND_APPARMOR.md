# 06 — Security Controls, Logging & AppArmor Profiles

> **Repository**: [`modelLink_server`](../README.md)  
> **Security Layers**: Application Security, AppArmor Sandboxing, Structured Pino Logging

---

## 6.1 Application-Level Security Controls

1. **Pure HTTP Bearer Token Authentication**: JWT signature verification (`jwt.verify`) on every protected route.
2. **Password Security & Expiration**: Passwords hashed using `bcrypt` (12 salt rounds). Enforces lockout after **10** consecutive failed login attempts (15-minute lockup window).
3. **HTTP Header Hardening (`helmet`)**: Configures `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security`.
4. **Rate Limiting (`express-rate-limit`)**: Limits global API throughput to prevent brute-force attacks.
5. **Data Sanitization**:
   - `xss-clean`: Strips HTML script tags from request body.
   - `hpp`: Protects against HTTP Parameter Pollution.

---

## 6.2 AppArmor Linux Kernel Security Profiles

**Directory**: [`apparmor/`](../apparmor)

The platform provides 3 custom AppArmor security profiles to enforce kernel-level isolation for containerized services on a shared Linux VPS:

1. **`modellink-restrict-db`**: Bound to the PostgreSQL container. Prevents execution of mounting binaries, limits filesystem access to PostgreSQL data directories, and denies `sys_admin` capabilities.
2. **`modellink-restrict-nginx`**: Bound to the Nginx gateway container. Restricts write access to `/var/log/nginx/` and `/var/cache/nginx/`, blocking shell execution inside the gateway.
3. **`modellink-restrict-pgadmin`**: Restricts pgAdmin container to isolated Python binaries and local socket communication.

---

## 6.3 Structured Pino Logging & Daily Rotation

- **Implementation**: [`utils/logger.js`](../utils/logger.js).
- Utilizes `pino` for low-overhead asynchronous logging and `pino-roll` for worker-thread daily log file rotation in `/logs/`.
- Prevents disk space exhaustion on VPS deployments while providing structured JSON logs containing timestamp, log level, event name, user custom ID, and stack trace.
