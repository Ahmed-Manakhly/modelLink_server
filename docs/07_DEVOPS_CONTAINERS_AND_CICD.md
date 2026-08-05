# 07 — DevOps, Containerization & CI/CD Pipelines

> **Repository**: [`modelLink_server`](../README.md)  
> **Infrastructure**: Docker, Nginx, Self-Hosted GitHub Actions Runner

---

## 7.1 Multi-Stage Dockerfile & Non-Root Execution

- **Implementation**: [`Dockerfile`](../Dockerfile), [`entrypoint.sh`](../entrypoint.sh).
- **Alpine Base Image**: `node:24-alpine` for lightweight container footprint.
- **Non-Root Execution**: Creates non-root group/user `modelLink` (UID `1001` / GID `1001`).
- **Privilege Dropping**: Container starts as `root` in `entrypoint.sh` to initialize directory permissions (`/public`, `/logs`, `/app/uploads`), then uses `su-exec modelLink` to drop privileges before executing `npm start`.

---

## 7.2 Container Orchestration Architecture (`docker-compose.yml`)

The platform defines two Docker Compose configurations:

1. `docker-compose.dev.yml`: Development setup using bind mounts and permissive 777 directory permissions for local hot reloading.
2. `docker-compose.yml`: Production setup using named volumes, isolated container network, AppArmor security profile bindings, and strict 755 directory permissions.

---

## 7.3 Automated 3-Phase Deployment Script (`deploy.sh`)

Executed automatically by the GitHub Actions self-hosted runner (`github-runner` user) upon pushes to `main`:

```bash
#!/usr/bin/env bash
set -e

# Phase 1: Reload AppArmor Kernel Profiles
sudo apparmor_parser -r -W ./apparmor/modellink-restrict-db
sudo apparmor_parser -r -W ./apparmor/modellink-restrict-nginx
sudo apparmor_parser -r -W ./apparmor/modellink-restrict-pgadmin

# Phase 2: Container Rebuild & Migration
docker compose up -d --build

# Phase 3: Post-Deployment Verification & Cache Warming
bash ./scripts/warm-cache.sh
```

---

## 7.4 Host-Level Nginx Reverse Proxy Gateway (Multi-Tenant VPS)

ModelLink operates on a shared VPS that hosts multiple independent applications. To manage this multi-tenant architecture, a **Host-Level Nginx Gateway** is used to route traffic before it ever hits the Docker containers.

1. **Host Nginx**: Sits directly on the VPS (outside Docker) listening on ports `80` and `443`.
2. **Domain Routing**: It intercepts requests for `www.modellink.manakhly.tech` and `api.modellink.manakhly.tech`.
3. **SSL Termination**: The host Nginx handles Let's Encrypt SSL certificates (Certbot) for all hosted applications, stripping the SSL and passing plain HTTP traffic downstream.
4. **Internal Routing**: For ModelLink traffic, the host Nginx acts as a reverse proxy, forwarding the traffic internally to ModelLink's Docker Compose exposed ports (e.g., the frontend React container or backend Node container).

This ensures ModelLink can securely co-exist on the same physical VPS alongside your other portfolio projects without port collisions.
