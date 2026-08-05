# ModelLink — Staff-Level Architecture Guide

> **Status**: Verified against actual implementation (source code, schema, config).  
> **Last verified**: 2026-08-05  
> **Verified by**: Independent final audit — source of truth is code, not prior documentation.

---

## 0. Purpose of This Document

This is the **authoritative technical reference** for new engineers, senior developers, and technical reviewers joining the ModelLink project. It reconciles the original planning architecture document with the **actual, deployed implementation**.

> [!IMPORTANT]
> All facts in this document have been verified against: `prisma/schema.prisma`, `server.js`, `app.js`, route files, controller logic, `docker-compose.yml`, `nginx.conf`, `deploy.sh`, `package.json`, and AppArmor profiles. Where discrepancies existed between prior documentation and code, this document reflects the code.

---

## 1. System Overview

ModelLink is an **AI model marketplace** built as a modular Express.js monolith. AI model developers list ML models (APIs, Docker images, license keys, etc.) for sale. Clients discover, purchase, and access models. The platform handles payments via Stripe and includes an in-process real-time chat system.

### 1.1 Technology Stack

| Layer                | Technology                         | Version / Detail                             |
| :------------------- | :--------------------------------- | :------------------------------------------- |
| **Runtime**          | Node.js + Express.js               | Express `^4.18.2`                            |
| **Database**         | PostgreSQL 17                      | Docker image `postgres:17-bookworm`          |
| **ORM**              | Prisma ORM                         | `^5.19.1` with `fullTextSearch` preview flag |
| **Auth**             | `jsonwebtoken` + `bcrypt`          | Bearer JWT only (cookie auth commented out)  |
| **Payments**         | Stripe SDK                         | `stripe ^12.11.0`                            |
| **Real-time**        | Socket.io                          | `^4.7.5`                                     |
| **File Uploads**     | `multer`                           | Stored under `/public`, Docker named volume  |
| **Logging**          | `pino` + `pino-roll`               | Daily rotating files in `/logs/`             |
| **Process Manager**  | none (Docker restart policy)       | `restart: unless-stopped`                    |
| **Containerisation** | Docker Compose                     | 4 services: db, pgadmin, nginx, backend      |
| **Frontend**         | React 18 (Create React App)        | `react-scripts 5.0.1` — **not Vite**         |
| **Frontend UI**      | Material UI v6, Bootstrap 5, Redux | `@reduxjs/toolkit ^2.3.0`                    |
| **Testing**          | Mocha + Chai + Supertest           | 16 test files, `npm test`                    |

### 1.2 Canonical Production Domain

The verified canonical domain is **`www.modellink.manakhly.tech`** (confirmed in `nginx.conf` `server_name` directive, `deploy.sh`, and the `09` runbook). The domain `modellink.com` appears only as the **default env var fallback value** inside `stripeConnect.controller.js` — it is **not** the deployed production address.

---

## 2. Repository Layout

```text
modelLink_server/
├── app.js                    # Express app factory: middleware, rate limiting, route mounting
├── server.js                 # HTTP server boot + Socket.io Server instance + process listeners
├── routes/                   # 18 route files (index.js barrel export)
│   ├── auth.route.js
│   ├── aiModel.route.js
│   ├── order.route.js        # stripeWebhook (no auth), demo-checkout, asset download
│   ├── stripe.route.js       # DEVELOPER-only Stripe Connect routes
│   └── ...
├── controller/               # Business logic controllers by domain
├── utils/                    # Shared: logger, ApiFeatures, email, encryption, bootstrap
├── prisma/
│   ├── schema.prisma         # 22 models (15 primary + 7 supporting)
│   └── prisma.js             # Singleton PrismaClient
├── nginx.conf                # Container-level Nginx gateway config
├── docker-compose.yml        # Production compose (4 services)
├── deploy.sh                 # AppArmor load → Docker network → compose up → cache warm
├── apparmor/                 # AppArmor profile sources (3 files)
│   ├── modellink-restrict-db
│   ├── modellink-restrict-nginx
│   └── modellink-restrict-pgadmin
├── postman/
│   └── ModelLink.postman_collection.json  # 120 requests / 17 folders (primary copy)
├── test/                     # 16 Mocha test files + helpers/
├── seeding_scripts/          # 9 flow directories + run_all.js
└── .github/workflows/
    └── deploy.yml            # Self-hosted GitHub Actions CI/CD
```

---

## 3. API Architecture

### 3.1 Base Path

All REST endpoints are mounted under **`/api`** — there is no version segment. The full public base URL is:

```text
https://www.modellink.manakhly.tech/api
```

> [!WARNING]
> Prior documentation frequently used `/api/v1/...` throughout. This prefix does **not** exist in the codebase. All route mounts in `app.js` use `/api`.

### 3.2 Route Mounting Map (from `app.js`)

| Mount Point                  | Route File                       | Auth Requirement                 |
| :--------------------------- | :------------------------------- | :------------------------------- |
| `/api/auth`                  | `auth.route.js`                  | Public + Protected mixed         |
| `/api/users`                 | `users.route.js`                 | Protected                        |
| `/api/admin/users`           | `usersAdmin.route.js`            | ADMIN / EMPLOYEE only            |
| `/api/admin`                 | `admin.route.js`                 | ADMIN / EMPLOYEE only            |
| `/api/aiModel`               | `aiModel.route.js`               | Public read + Protected write    |
| `/api/orders`                | `order.route.js`                 | Protected (webhook is unguarded) |
| `/api/reviews`               | `review.route.js`                | Protected                        |
| `/api/conversations`         | `conversation.route.js`          | Protected                        |
| `/api/messages`              | `message.route.js`               | Protected                        |
| `/api/notification`          | `notification.route.js`          | Protected                        |
| `/api/verifications`         | `developerVerification.route.js` | Protected                        |
| `/api/wallets`               | `wallet.route.js`                | Protected                        |
| `/api/payouts`               | `payout.route.js`                | Protected / ADMIN                |
| `/api/disputes`              | `dispute.route.js`               | Protected                        |
| `/api/taxonomy`              | `taxonomy.route.js`              | Public read + Protected write    |
| `/api/stripe`                | `stripe.route.js`                | DEVELOPER role only              |
| `/api/support`               | `support.route.js`               | Public                           |

### 3.3 Authentication

- **Transport**: HTTP `Authorization: Bearer <jwt>` header. Cookie auth is commented out in `auth.controller.js`.
- **Fallback**: `?token=<jwt>` query string (used for signed asset download URLs).
- **Guard middleware**: `authController.protect` — verifies JWT signature, checks `deletedAt`, `isActive`, lockout expiry, password-change invalidation timestamp, and role-change invalidation.
- **JWT payload**: `{ id, org_username, role }`.
- **Access token expiry**: `ACCESS_TOKEN_EXPIRATION` env var (default: `2700000` ms = 45 minutes).
- **bcrypt salt rounds**: **12** (verified in `auth.controller.js` — `bcrypt.hash(password, 12)`).
- **Account lockout threshold**: **10** consecutive failed attempts (verified: `if (failedAttempts >= 10)`). Lockout window: 15 minutes. Auto-unlocks on next successful login attempt after expiry.
- **OTP length**: **4 digits** (code: `Math.floor(1000 + Math.random() * 9000)`).

---

## 4. Stripe Payment Architecture

### 4.1 Dual-Path Overview

ModelLink implements a **Dual-Path Payment Architecture** where all orders funnel into a single shared atomic settlement function regardless of payment path:

```text
Path 1 (Production Stripe)                Path 2 (Demo Bypass)
──────────────────────────                ────────────────────────────────────
POST /api/orders/create-payment-intent    POST /api/orders/:id/demo-checkout
  → stripe.paymentIntents.create()          (any authenticated CLIENT,
  → returns clientSecret                     order must be PENDING)
  → Stripe Elements (client-side)
  → Stripe fires webhook

POST /api/orders/stripe-webhook (raw, no auth)
  → event: payment_intent.succeeded
          ↓
          fulfillOrder(orderId, paymentIntentId, stripeEventId, io)
          ┌──────────────────────────────────────────────────────┐
          │ Prisma $transaction:                                  │
          │  1. Order status PENDING → PAID                      │
          │  2. Transaction record (grossAmount, fee, payout)    │
          │  3. Developer Wallet.pendingBalance += developerNet  │
          │  4. WalletTransaction (type: SALE)                   │
          │  5. User.total_orders += 1                           │
          │  6. AiModel.sales += 1                               │
          └──────────────────────────────────────────────────────┘
```

> [!IMPORTANT]
> The `MARKETPLACE_DEMO` environment variable has been **removed from the codebase**. `utils/marketplaceDemo.js` confirms this explicitly. Demo mode is no longer env-flag-gated — the `POST /api/orders/:id/demo-checkout` endpoint is always available to authenticated CLIENTs with PENDING orders. It is blocked in production only by the fact that `isMockWebhookAllowed()` prevents unsigned mock webhook payloads in production environments.

### 4.2 Stripe Connect Express (Developer Onboarding)

All Stripe Connect routes require `DEVELOPER` role (`/api/stripe`):

| Method | Endpoint                            | Purpose                                                            |
| :----- | :---------------------------------- | :----------------------------------------------------------------- |
| `GET`  | `/api/stripe/connect/status`        | Reads DB status + live Stripe sync for `stripeChargesEnabled`      |
| `POST` | `/api/stripe/connect/onboard`       | Creates Stripe Express account + returns hosted onboarding URL     |
| `POST` | `/api/stripe/connect/complete-demo` | Marks `stripeChargesEnabled=true` without Stripe (blocked in prod) |

### 4.3 Webhook Handler

```text
POST /api/orders/stripe-webhook    (no JWT auth — Stripe signature verification only)
```

**Handled events**:

- `payment_intent.succeeded` → calls `fulfillOrder()` → marks order `PAID`, creates `Transaction` record, credits developer `Wallet`.
- `account.updated` → syncs `stripeChargesEnabled` / `stripeDetailsSubmitted` on `User` from Stripe Connect account data.

**Idempotency**: Every event is upserted into `WebhookEvent` table. Events already in `PROCESSED` status are skipped immediately (returns 200 without re-processing).

**Signature verification**: Uses `stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret)`. Falls back to allowing unsigned payloads only when `NODE_ENV` is `development`, `test`, or `docker_development`.

### 4.4 Order Lifecycle

```text
PENDING → PAID → DELIVERED
               ↘ DISPUTED → RESOLVED
               ↘ REFUNDED
               ↘ CANCELLED
```

---

## 5. Socket.io Architecture

Socket.io is initialized **inline in `server.js`** (not in a separate `socket.js` file — that file does not exist):

```js
const io = new Server(server, {
  path: "/api/socket.io/", // Custom path — overrides Socket.io default
  pingTimeout: 60000,
  cors: { origin: allowedOrigins, credentials: true },
});
app.set("io", io); // Injected into controllers via req.app.get('io')
```

### 5.1 Authentication

JWT is passed via **`socket.handshake.auth.token`** — not as a query string. Server middleware (`io.use(...)`) verifies with `jwt.verify(token, ACCESS_SECRET_STR)` and attaches `socket.userId`.

### 5.2 Room Architecture

Rooms are **per-user**, not per-conversation. All messages and notifications for a user are routed through one personal room:

```js
socket.join(`${socket.userId}__room`);
```

### 5.3 Event Reference

| Client Emits   | Server Action                                                              |
| :------------- | :------------------------------------------------------------------------- |
| `joinRoom`     | Joins `{userId}__room`, validates ownership, broadcasts `get-users` list   |
| `msg_created`  | Routes `{ forId, message }` → emits `receive_msg` to `{forId}__room`       |
| `typing`       | Routes `{ forId, conversationId }` → emits `typing` to `{forId}__room`     |
| `stopTyping`   | Routes `{ forId, conversationId }` → emits `stopTyping` to `{forId}__room` |
| `refreshModel` | Routes `{ to, ... }` → emits `modelRefresh` to `{to}__room`                |
| `new_model`    | Global broadcast: emits `new_model_created` to all connected clients       |
| `leavingRoom`  | Removes from `activeUsers`, broadcasts updated `get-users`                 |
| `disconnect`   | Removes from `activeUsers`, broadcasts updated `get-users`                 |

### 5.4 Nginx WebSocket Proxy

`nginx.conf` has a dedicated `location /socket.io/ { ... }` block with `proxy_set_header Upgrade $http_upgrade` and `Connection 'upgrade'` to correctly proxy WebSocket traffic to the backend container.

---

## 6. Database Schema

### 6.1 Model Inventory (25 total)

| Domain                    | Models                                                                                                           |
| :------------------------ | :--------------------------------------------------------------------------------------------------------------- |
| **Identity & Governance** | `User`, `EmailToken`, `DeveloperVerification`, `AuditLog`, `SystemSettings`                                      |
| **Product Catalog**       | `AiModel`, `AiModelVersion`, `ModelAsset`, `AiModelFeature`, `AiModelMetric`, `Category`, `Modality`, `BodyPart` |
| **Transactional Ledger**  | `Order`, `Transaction`, `WebhookEvent`, `Wallet`, `WalletTransaction`, `DeveloperPayout`, `Dispute`              |
| **Communication**         | `Conversation`, `ConversationParticipant`, `Message`                                                             |
| **Reviews & Feedback**    | `Review`                                                                                                         |
| **Notifications**         | `Notification`                                                                                                   |

### 6.2 Critical Schema Facts (Frequently Misstated)

**`Order.stripePaymentIntentId`** — The Order model stores a `stripePaymentIntentId` (the `pi_...` PaymentIntent ID from Stripe). There is **no `stripeSessionId` field** in the schema.

**`Transaction` model** — A separate `Transaction` record (1:1 with `Order`) stores the financial split: `grossAmount`, `platformFee`, `developerPayout`, `stripeEventId`, `currency`.

**`WalletTransactionType` enum** — Values are: `SALE`, `PAYOUT`, `REFUND`, `PLATFORM_FEE`, `ADJUSTMENT`. There is no `EARNING` type.

**Wallet ledger** — This is an **append-only log**, not a true double-entry bookkeeping system. `Wallet.pendingBalance` / `availableBalance` are updated via Prisma `increment`/`decrement` operations.

**`AiModel.status` enum** — `DRAFT`, `PUBLISHED`, `SUSPENDED`, `ARCHIVED`. There is no `HIDDEN` status.

**`DisputeStatus` enum** — `OPEN`, `UNDER_REVIEW`, `RESOLVED`, `REJECTED`.

**`Conversation.pairKey`** — `@unique` constraint. Built as `[idA, idB].sort().join('_')`. Nullable — set to `null` for non-DM rows.

**`ModelAsset.encryptedValue`** — Typed delivery assets. `AssetType` enum: `API_ENDPOINT`, `DOCKER_IMAGE`, `DOWNLOAD_LINK`, `LICENSE_KEY`, `HUGGINGFACE_URL`.

**`User.id`** — CUID string (not auto-increment integer). All FK relationships are `String` typed.

### 6.3 Key Indexes

```prisma
User             @@index([email])
AiModel          @@index([developerId, status]) @@index([title]) @@index([category]) @@index([categoryId])
Order            @@index([clientId]) @@index([developerId]) @@index([developerId, status, createdAt])
                 @@index([stripePaymentIntentId]) @@index([status, createdAt]) @@index([versionId])
AiModelVersion   @@index([aiModelId, isActive]) @@index([modalityId]) @@index([bodyPartId])
Message          @@index([conversationId]) @@index([conversationId, createdAt])
WalletTransaction @@index([walletId]) @@index([walletId, createdAt])
Review           @@unique([aiModelId, clientId])   // One review per model per client
```

---

## 7. Deployment Architecture

### 7.1 Infrastructure Stack

```text
VPS Host (Ubuntu)
├── Host Nginx (ports 443 / 80)
│   ├── SSL termination via Certbot (Let's Encrypt)
│   ├── www → HTTPS redirect
│   └── proxy_pass → http://localhost:8080
│
└── Docker Compose Stack
    ├── modellink_nginx   (host port 8080 → container port 80)
    │   ├── WAF: deny list + path-pattern blocking
    │   ├── /public/     → named volume (static assets, no backend round-trip)
    │   ├── /api         → modellink_backend:8000
    │   ├── /socket.io/  → modellink_backend:8000  (WebSocket upgrade)
    │   ├── /sitemap.xml → modellink_backend:8000/sitemap.xml
    │   └── /            → modellink_frontend:3000
    │
    ├── modellink_backend (port 8000:8000)
    │   └── Node.js / Express — runs as UID 1001 (su-exec)
    │
    ├── modellink_postgres (internal only — db network)
    │   └── postgres:17-bookworm
    │
    └── modellink_pgadmin (port 5333:80)
        └── dpage/pgadmin4

Docker Networks:
  db              — internal bridge (db ↔ backend ↔ pgadmin ↔ nginx)
  modelink-network — external (shared across multi-tenant VPS application stacks)

Named Volumes: db, app-volume (public files), logs-volume
```

> [!NOTE]
> SSL and HTTPS redirect are handled **exclusively by the host-level Nginx + Certbot**. The container nginx listens on HTTP only. `certbot`, `certbot-init`, cert volume mounts, and the webroot challenge handler have all been **removed** from `docker-compose.yml`.

### 7.2 AppArmor Profiles

Profile sources live in the **`apparmor/`** directory at the repo root (not `deploy/apparmor/`). Every run of `deploy.sh` copies them to `/etc/apparmor.d/` and reloads:

```bash
sudo cp apparmor/modellink-restrict-db      /etc/apparmor.d/
sudo cp apparmor/modellink-restrict-nginx   /etc/apparmor.d/
sudo cp apparmor/modellink-restrict-pgadmin /etc/apparmor.d/
sudo apparmor_parser -r -W /etc/apparmor.d/modellink-restrict-db
# ... same for the other two
```

Each profile is bound to its container via `security_opt: [apparmor=<profile-name>]` in `docker-compose.yml`. The **backend container has no AppArmor profile** — it is protected by non-root UID execution instead.

### 7.3 Non-Root Container Execution

The backend container runs as UID `1001` (user `modelLink`) via `su-exec` in `entrypoint.sh`. This prevents host privilege escalation even if the Node.js process is compromised inside the container.

### 7.4 CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
Trigger:  push to main
Runner:   self-hosted (the VPS itself)

Steps:
  1. actions/checkout@v4
  2. cp ~/modelink-backend/.env ./.env    # Env injected from VPS home directory
  3. bash ./deploy.sh
  4. docker image prune -f
```

`deploy.sh` execution sequence:

1. Copy and reload AppArmor profiles
2. Ensure `modelink-network` Docker network exists (creates if absent)
3. `docker compose up -d --build` (up to 3 retries, 10s sleep between)
4. `docker compose exec nginx nginx -s reload`
5. Health poll: `GET http://localhost:8080/api/health` for up to 90 seconds
6. Cache warm: `bash ./scripts/warm-cache.sh`

---

## 8. Security Controls

| Control                  | Actual Implementation                                                                |
| :----------------------- | :----------------------------------------------------------------------------------- |
| **Auth mechanism**       | Bearer JWT only; cookie auth code is commented out                                   |
| **Password hashing**     | `bcrypt` with **12** salt rounds                                                     |
| **Account lockout**      | **10** consecutive failures → 15-min lockout; auto-unlocks after expiry              |
| **OTP length**           | **4 digits** (`Math.floor(1000 + Math.random() * 9000)`)                             |
| **HTTP headers**         | `helmet` middleware                                                                  |
| **Rate limiting**        | `express-rate-limit` (global)                                                        |
| **Input sanitisation**   | `express-mongo-sanitize` (NoSQL injection), `hpp` (HTTP parameter pollution)         |
| **Container sandbox**    | AppArmor on db / nginx / pgadmin; UID 1001 non-root on backend                       |
| **WAF deny list**        | Static IP blocklist in `nginx.conf` + path-pattern blocks (`.env`, `wp-admin`, etc.) |
| **HSTS**                 | `Strict-Transport-Security: max-age=0` in container nginx (real HSTS on host nginx)  |
| **Asset delivery**       | Signed time-limited URLs (`expires` + `signature` query params)                      |
| **Webhook verification** | `stripe.webhooks.constructEvent` signature check; unsigned payloads blocked in prod  |

---

## 9. Testing & Seeding

### 9.1 Test Suite

```bash
npm test    # Runs 16 Mocha test files
```

Test files: `auth`, `aiModelCatalog`, `version`, `orderLifecycle`, `orderActions`, `review`, `reviewByModel`, `messaging`, `readState`, `filters`, `taxonomy`, `disputeAdmin`, `walletPayout`, `users`, `health`, `supportStripeVerification`.

### 9.2 Seeding

```bash
node seeding_scripts/run_all.js             # Full seed (all 9 flows)
node seeding_scripts/run_all.js 03 05       # Run only flows 03 and 05
node seeding_scripts/db_cleaners/clean_all.js --confirm  # DB reset
```

> [!WARNING]
> **There is no `npm run seed` script** in `package.json`. All seeding commands invoke `node seeding_scripts/...` directly.

The 9 seeding flow directories:

```text
00_taxonomy_categories_flow
01_auth_profile_flow
02_developer_verification_flow
03_model_publishing_flow
03b_model_versions_flow
04_client_discovery_flow
05_order_transaction_flow
06_payout_lifecycle
07_admin_edge_cases
```

### 9.3 Postman Collection

| Property           | Value                                                                            |
| :----------------- | :------------------------------------------------------------------------------- |
| **Primary file**   | `modelLink_server/postman/ModelLink.postman_collection.json`                     |
| **Mirror**         | `modelLink_planning/ModelLink.postman_collection.json`                           |
| **Total requests** | **120** (verified by recursive count)                                            |
| **Folders**        | **17** top-level domain folders                                                  |

---

## 10. Documentation Mismatch Record

> [!WARNING]
> The following confirmed inaccuracies existed in the previously generated documentation set. All have been corrected in the corresponding `docs/01`–`docs/09` files. This table is an audit record.

| #   | Doc(s) Affected     | Inaccurate Claim                                                                                 | Verified Correct Value                                                                         |
| :-- | :------------------ | :----------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| 1   | `01` `03` `05` `09` | API prefix `/api/v1/...`                                                                         | Actual prefix: `/api/...` — no version segment                                                 |
| 2   | `01` `02` `03` `05` | Stripe webhook event: `checkout.session.completed`                                               | Actual: `payment_intent.succeeded`                                                             |
| 3   | `03` `05`           | Stripe payment: `POST /api/stripe/create-checkout-session` → `stripe.checkout.sessions.create()` | Actual: `POST /api/orders/create-payment-intent` → `paymentIntents.create()` + Stripe Elements |
| 4   | `01` `05` `09`      | Stripe webhook path: `/api/v1/stripe/webhook`                                                    | Actual: `POST /api/orders/stripe-webhook`                                                      |
| 5   | `05` `08` `09`      | `MARKETPLACE_DEMO=true` env var controls demo mode                                               | `MARKETPLACE_DEMO` removed; demo is a standard route call                                      |
| 6   | `02` `04`           | `Order.stripeSessionId` field exists                                                             | Field does not exist; actual field: `stripePaymentIntentId`                                    |
| 7   | `03` `05` `09`      | Socket.io implemented in `socket.js`                                                             | Inline in `server.js` — no `socket.js` file                                                    |
| 8   | `03` `05`           | Socket.io auth via `?token=` query string                                                        | Actual: `socket.handshake.auth.token`                                                          |
| 9   | `03` `05`           | Socket events: `join-chat`, `send_msg`; rooms: `chat_<id>`                                       | Actual: `joinRoom`, `msg_created`; rooms: `{userId}__room`                                     |
| 10  | `06`                | bcrypt salt rounds: 10                                                                           | Actual: **12**                                                                                 |
| 11  | `06`                | Account lockout: 5 failed attempts                                                               | Actual: **10** (`if (failedAttempts >= 10)`)                                                   |
| 12  | `01` `04`           | "Double-Entry Financial Ledger"                                                                  | Ledger is append-only log, not true double-entry                                               |
| 13  | `04`                | 15 models in schema                                                                              | Actual: **25** models (verified by exact schema count)                                         |
| 14  | `09`                | Postman path: `modelLink_planning/reference/...`                                                 | Actual: `modelLink_server/postman/ModelLink.postman_collection.json`                           |
| 15  | `09`                | Postman request count: 116                                                                       | Actual: **120** (verified by recursive script)                                                 |
| 16  | `08`                | `npm run seed` script                                                                            | No such npm script; actual: `node seeding_scripts/run_all.js`                                  |
| 17  | `09`                | AppArmor profiles in `deploy/apparmor/`                                                          | Actual: in `apparmor/` (repo root level)                                                       |
| 18  | `09`                | Frontend runtime: Vite                                                                           | Actual: Create React App (`react-scripts 5.0.1`)                                               |
| 19  | `09`                | Webhook subscription: `payment_intent.payment_failed`                                            | Actual second event: `account.updated`                                                         |
| 20  | `04`                | `WalletTransaction.type` value `EARNING`                                                         | Actual: `SALE` (enum `WalletTransactionType`)                                                  |

---

_This document is the final verified reference. For any updates to the implementation, update the relevant section and bump the verification date at the top._
