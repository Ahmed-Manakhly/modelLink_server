# 09. Environment Operations & Runtime Runbook

This document details the operational workflows, deployment patterns, runtime environments, seeding engine hierarchy, database cleaners, Stripe webhook workflows, and testing procedures for ModelLink.

---

## 9.1 Environment Overview & Setup

ModelLink supports three distinct execution environments: **Native Local**, **Docker Local**, and **VPS Production**.

### 9.1.1 Environment Setup Workflow

Before running the application in any environment, initialize environment variable files from their templates:

```bash
# Server environment setup
cd modelLink_server && cp .env.example .env

# Client environment setup
cd modelLink_client && cp .env.example .env
```

Key environment variables to configure in `modelLink_server/.env`:

- `PORT`: HTTP port for backend server (default: `8000`).
- `DATABASE_URL`: PostgreSQL connection string (e.g. `postgresql://modellink_user:password@localhost:5432/modellink_db`).
- `ACCESS_SECRET_STR`: JWT signing secret.
- `STRIPE`, `STRIPE_WEBHOOK_SECRET`, & `STRIPE_LOCAL_WEBHOOK_SECRET`: Stripe API keys.
- `MARKETPLACE_DEMO`: **Removed** — demo mode is no longer env-flag-gated. Demo checkout is available to any authenticated user in development/non-production environments.

---

## 9.2 Environment Comparison Matrix

| Concern                | Native Local                                              | Docker Local                                    | VPS Production                                           | Status                                               |
| :--------------------- | :-------------------------------------------------------- | :---------------------------------------------- | :------------------------------------------------------- | :--------------------------------------------------- |
| **Frontend Runtime**   | Create React App (`npm start`, `http://localhost:3000`)   | Docker Node container (`http://localhost:3000`) | Nginx container (`https://www.modellink.manakhly.tech`)  | **IMPLEMENTED**                                      |
| **Backend Runtime**    | Node.js Express (`npm start`, `http://localhost:8000`)    | Docker Node container (`http://localhost:8000`) | Docker Node container (`port 8000`, Nginx reverse proxy) | **IMPLEMENTED**                                      |
| **PostgreSQL DB**      | Docker container (`port 5432`) via `docker compose up db` | Docker Compose `postgres` service               | Docker Compose `postgres` service on VPS                 | **IMPLEMENTED**                                      |
| **API Base URL**       | `http://localhost:8000/api`                               | `http://localhost:8000/api`                     | `https://www.modellink.manakhly.tech/api`                | **IMPLEMENTED**                                      |
| **Networking**         | Local loopback (`127.0.0.1`)                              | Docker bridge network (`modelink-network`)      | Docker bridge network + VPS host ports                   | **IMPLEMENTED**                                      |
| **Domain Config**      | `localhost`                                               | `localhost`                                     | `https://www.modellink.manakhly.tech/`                   | **IMPLEMENTED**                                      |
| **HTTPS / TLS**        | Disabled (HTTP only)                                      | Disabled (HTTP only)                            | Nginx TLS configuration ready                            | **PARTIAL** (Certbot deployment script present)      |
| **Secrets Management** | Local `.env` file                                         | Local `.env` loaded into Docker Compose         | `.env` file on VPS host                                  | **IMPLEMENTED**                                      |
| **Logging & Tracing**  | Console stdout                                            | `docker logs -f modellink_backend`              | Docker logs & `pino-roll` daily log rotation             | **IMPLEMENTED**                                      |
| **AppArmor Profiles**  | Disabled (Linux dev optional)                             | Defined in `/etc/apparmor.d/`                   | Active profiles (`modellink-restrict-db`, etc.)          | **IMPLEMENTED**                                      |
| **CI/CD Automation**   | N/A (Manual invocation)                                   | N/A (Manual invocation)                         | GitHub Actions self-hosted runner                        | **PARTIAL** (Runner dirs exist, workflow configured) |

---

## 9.3 System Feature & Integration Status Matrix

To maintain accurate operational expectations, system features are categorized by implementation readiness:

- **IMPLEMENTED**: Code exists, is fully wired, and verified working.
- **PARTIAL / REQUIRES MANUAL CONFIG**: Code exists, but depends on external credentials or manual setup.
- **PLANNED / STUBBED**: Interface or requirement defined, but backend implementation is not active.

| Feature / Subsystem                 | Status          | Implementation Details & References                                                                                                                      |
| :---------------------------------- | :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Native Local Boot**               | **IMPLEMENTED** | `docker compose up -d db` + `npm start` in `server.js`.                                                                                                  |
| **Docker Local Boot**               | **IMPLEMENTED** | `./deploy.dev.sh` orchestration using [`docker-compose.yml`](../docker-compose.yml).                                                                     |
| **VPS Production Boot**             | **IMPLEMENTED** | `./deploy.sh` script executing on VPS host.                                                                                                              |
| **JWT Bearer Token Auth**           | **IMPLEMENTED** | Header `Authorization: Bearer <token>` in [`controller/auth.controller.js`](../controller/auth.controller.js).                                           |
| **Atomic Wallet Ledger**            | **IMPLEMENTED** | Model `WalletTransaction` (`SALE`, `PAYOUT`, `REFUND`, `PLATFORM_FEE`, `ADJUSTMENT`).                                                                    |
| **Seeding Engine (Flows 00-07)**    | **IMPLEMENTED** | Complete 9-stage orchestrator in [`seeding_scripts/run_all.js`](../seeding_scripts/run_all.js).                                                          |
| **Granular DB Cleaners**            | **IMPLEMENTED** | Prisma-based reset scripts in [`seeding_scripts/db_cleaners/`](../seeding_scripts/db_cleaners/).                                                         |
| **Stripe Local Webhook Forwarding** | **IMPLEMENTED** | Local forwarder via `stripe listen --forward-to localhost:8000/api/orders/stripe-webhook`.                                                               |
| **Stripe Production Webhooks**      | **PARTIAL**     | Webhook handler [`orderController.stripeWebhook`](../controller/order.controller.js) implemented; requires dashboard endpoint registration.              |
| **Developer Verification Approval** | **IMPLEMENTED** | Document submission API + manual CLI approve script [`approve_pending_verifications.js`](../seeding_scripts/dev_tools/approve_pending_verifications.js). |
| **Socket.io Chat Messaging**        | **IMPLEMENTED** | Real-time chat with `@unique` indexed `pairKey`. Socket.io `Server` instance embedded in [`server.js`](../server.js).                                    |
| **SMTP Email Verification**         | **PARTIAL**     | Nodemailer transport in [`utils/email.js`](../utils/email.js); requires valid SMTP credentials in `.env`.                                                |
| **AppArmor Security Containment**   | **IMPLEMENTED** | Profiles in `apparmor/` directory of repo, copied to `/etc/apparmor.d/` during deploy.                                                                   |
| **Non-Root Container Execution**    | **IMPLEMENTED** | Executed via `su-exec modelLink` (UID `1001`) in [`Dockerfile`](../Dockerfile) and [`entrypoint.sh`](../entrypoint.sh).                                  |
| **Automated Test Battery**          | **IMPLEMENTED** | 16 test files executed via `npm test` using Mocha, Chai, and Supertest.                                                                                  |

---

## 9.4 Seeding Engine Architecture & Flow Hierarchy

The seeding engine operates across 9 sequential flows to generate deterministic test data for development and validation.

> [!NOTE]
> **API vs Prisma Access Distinction**:
>
> - **Seeding Bots (Flows 00–07)** connect exclusively via **HTTP REST APIs** (`http://localhost:8000/api`), simulating authentic user actions.
> - **Database Cleaners & Reset Scripts** connect directly to PostgreSQL via the **Prisma ORM** (`DATABASE_URL`), requiring direct database network access.

```mermaid
graph TD
    A["Flow 00: Taxonomy & Categories"] --> B["Flow 01: Auth & Profiles"]
    B --> C["Flow 02: Dev Verification (Submit Docs)"]
    C --> D["Flow 02b: Admin Verification Approval"]
    D --> E["Flow 03: Model Publishing (30 Catalog Models)"]
    E --> F["Flow 03b: Model Versions Seeding"]
    F --> G["Flow 04: Client Discovery & Query Verification"]
    G --> H["Flow 05: Order, Payment & Dispute Lifecycle"]
    H --> I["Flow 06: Payout Lifecycle"]
    E --> J["Flow 07: Admin Edge Cases (Soft Delete / Restore)"]
```

### 9.4.1 Seeding Flow Details

1. **Flow 00 — Taxonomy & Categories**:
   - **Script**: `node seeding_scripts/00_taxonomy_categories_flow/bot.js`
   - **Action**: Seeds parent categories, subcategories, modalities, and body parts.
2. **Flow 01 — Auth & Profiles**:
   - **Script**: `node seeding_scripts/01_auth_profile_flow/bot.js`
   - **Action**: Registers 3 clients and 3 developers, completes profile metadata.
3. **Flow 02 — Developer Verification (Submit)**:
   - **Script**: `node seeding_scripts/02_developer_verification_flow/bot.js`
   - **Action**: Submits ID verification documents (status: `PENDING`).
4. **Flow 02b — Admin Verification Approval**:
   - **Script**: `node seeding_scripts/02_developer_verification_flow/admin_approve.js`
   - **Action**: Admin approves pending verifications to enable model publishing.
5. **Flow 03 — Model Publishing**:
   - **Script**: `node seeding_scripts/03_model_publishing_flow/bot.js`
   - **Action**: Publishes 30 realistic AI models across approved developers.
6. **Flow 03b — Model Versions**:
   - **Script**: `node seeding_scripts/03b_model_versions_flow/bot.js`
   - **Action**: Adds multi-version catalog data, pricing, metrics, and asset files.
7. **Flow 04 — Client Discovery**:
   - **Script**: `node seeding_scripts/04_client_discovery_flow/bot.js`
   - **Action**: Executes read-only search, filter, and pagination queries against published models.
8. **Flow 05 — Order, Payment, Delivery & Dispute**:
   - **Script**: `node seeding_scripts/05_order_transaction_flow/bot.js`
   - **Action**: Executes 7 orders (6 happy-path completed orders + 1 admin dispute resolution).
9. **Flow 06 — Payout Lifecycle**:
   - **Script**: `node seeding_scripts/06_payout_lifecycle/bot.js`
   - **Action**: Developers request payout of accumulated wallet balances; admin approves.
10. **Flow 07 — Admin Edge Cases**:
    - **Script**: `node seeding_scripts/07_admin_edge_cases/bot.js`
    - **Action**: Soft-deletes a model, verifies catalog exclusion, restores model.

### 9.4.2 Main Seeding Commands

```bash
# Reset input queues to initial reference state
./seeding_scripts/reset_seed_inputs.sh

# Run full reset + full 9-flow seeding
node seeding_scripts/run_all.js reset && node seeding_scripts/run_all.js

# Run specific flows only (e.g. 03 and 05)
node seeding_scripts/run_all.js 03 05
```

---

## 9.5 Granular Database Cleaners

Database cleaners use Prisma ORM to reset specific domain tables without requiring container rebuilds.

> [!CAUTION]
> Running cleaners against production databases will permanently delete data. Cleaners must be executed directly on the VPS host or a machine with direct database connectivity.

```bash
# Wipe entire database EXCEPT platform Admin account
node seeding_scripts/db_cleaners/clean_all.js --confirm

# Domain-specific cleaners
node seeding_scripts/db_cleaners/clean_models.js        # AI models, versions, metrics
node seeding_scripts/db_cleaners/clean_orders.js        # Orders, transactions, reviews
node seeding_scripts/db_cleaners/clean_users.js         # Users (except Admin)
node seeding_scripts/db_cleaners/clean_verifications.js # Verification requests
node seeding_scripts/db_cleaners/clean_wallets.js       # Wallets, transactions, payouts
node seeding_scripts/db_cleaners/clean_notifications.js # System notifications
node seeding_scripts/db_cleaners/clean_conversations.js # Chat conversations & messages
node seeding_scripts/db_cleaners/clean_reviews.js       # Model reviews & ratings
node seeding_scripts/db_cleaners/clean_taxonomy.js      # Taxonomy categories & body parts
```

---

## 9.6 Stripe Webhook Integration & Testing

ModelLink processes Stripe webhooks to trigger atomic order fulfillment and atomic wallet transaction ledger updates.

### 9.6.1 Webhook Endpoint Configuration

The Stripe webhook route is defined in [`routes/order.route.js`](../routes/order.route.js) and mounted at:
`/api/orders/stripe-webhook`

### 9.6.2 Local Development Webhook Forwarding

To test Stripe checkout events locally:

1. Install and authenticate the Stripe CLI:

   ```bash
   stripe login
   ```

2. Forward events to the local Express backend:

   ```bash
   stripe listen --forward-to localhost:8000/api/orders/stripe-webhook
   ```

3. Copy the generated Webhook Signing Secret (`whsec_...`) into `modelLink_server/.env` as `STRIPE_WEBHOOK_SECRET`.

### 9.6.3 Production Webhook Configuration

For VPS production deployments:

1. Register the webhook endpoint in the Stripe Dashboard (**Developers → Webhooks**):
   `https://www.modellink.manakhly.tech/api/orders/stripe-webhook`

2. Subscribe to the following event types:
   - `payment_intent.succeeded`
   - `account.updated`

3. Save the production signing secret to the VPS environment configuration.

---

## 9.7 Automated Testing Battery

ModelLink includes **16 test files** executed using Mocha, Chai, and Supertest against a live backend instance.

### 9.7.1 Executing Tests

```bash
# Ensure local backend server is running on http://localhost:8000
cd modelLink_server
npm test
```

### 9.7.2 Test Coverage Inventory

| Test File                                                                        | Covered Functionality                                               |
| :------------------------------------------------------------------------------- | :------------------------------------------------------------------ |
| [`health.test.js`](../test/health.test.js)                                       | Server health route (`/api/health`) & root status endpoint.         |
| [`users.test.js`](../test/users.test.js)                                         | Public developer profiles, user directory, and profile updating.    |
| [`aiModelCatalog.test.js`](../test/aiModelCatalog.test.js)                       | AI model listing, dynamic query filters, model details, versions.   |
| [`orderLifecycle.test.js`](../test/orderLifecycle.test.js)                       | Intent creation, Stripe webhook processing, delivery confirmation.  |
| [`walletPayout.test.js`](../test/walletPayout.test.js)                           | Wallet balance queries, ledger entries, payout requests & approval. |
| [`disputeAdmin.test.js`](../test/disputeAdmin.test.js)                           | Dispute opening, admin audit logs, dispute status resolution.       |
| [`taxonomy.test.js`](../test/taxonomy.test.js)                                   | Public taxonomy fetching & admin category management.               |
| [`messaging.test.js`](../test/messaging.test.js)                                 | Conversation creation, message sending, and unread counts.          |
| [`supportStripeVerification.test.js`](../test/supportStripeVerification.test.js) | Contact support form submission & Stripe Connect demo status.       |
| [`reviewByModel.test.js`](../test/reviewByModel.test.js)                         | Public and authenticated review creation & rating calculations.     |
| [`auth.test.js`](../test/auth.test.js)                                           | User registration, login, logout, and token validation.             |
| [`review.test.js`](../test/review.test.js)                                       | Review update, deletion, and permission constraints.                |
| [`orderActions.test.js`](../test/orderActions.test.js)                           | Order cancellation, refund workflows, and admin overrides.          |
| [`version.test.js`](../test/version.test.js)                                     | Model versioning, metrics update, feature tags, and asset links.    |
| [`readState.test.js`](../test/readState.test.js)                                 | Notification delivery, unread flags, and bulk read operations.      |
| [`filters.test.js`](../test/filters.test.js)                                     | Unit testing for filter normalization query utilities.              |

---

## 9.8 Postman API Collection Workflow

The project maintains a Postman collection covering all backend API endpoints.

- **Collection File**: `modelLink_server/postman/ModelLink.postman_collection.json`
- **Scope**: **120** HTTP requests organized across **17** structured folders.
- **Automated Variable Chaining**: Scripts automatically capture `jwt_token`, `user_id`, `order_id`, `payment_intent_id`, and entity IDs upon request completion.

### 9.8.1 Collection Execution Steps

1. Import `ModelLink.postman_collection.json` into Postman.

2. Confirm the environment variable `base_url` is set to `http://localhost:8000/api`.

3. Execute `1. Auth -> Login` to populate the `jwt_token` variable.

4. Execute subsequent requests; collection-level headers automatically attach `Authorization: Bearer {{jwt_token}}`.
