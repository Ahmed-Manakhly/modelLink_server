# ✨ QUICK START (Manual & Automated Seeding)

## 0. SETUP ENVIRONMENT

Copy the example environment files before starting:

```bash
cd modelLink_server && cp .env.example .env
cd modelLink_client && cp .env.example .env
```

> Note: Fill in your DB credentials, Stripe keys, and JWT secrets.

---

## 1. LOCAL ENVIRONMENT

### Start the Application

1. **Start Database**:
   Open a backend terminal and run:

   ```bash
   ./start-db-only.dev.sh
   ```

   > This will start the DB/PgAdmin only.

2. **Start Servers**:
   Run this in BOTH backend and frontend terminals:

   ```bash
   npm start
   ```

### Manual Testing (No Automated Scripts)

> Assumption: Admin user is already created via server bootstrap.

1. **Clean the Database** (for test purposes):

   ```bash
   node seeding_scripts/db_cleaners/clean_all.js --confirm
   ```

   > No need to restart the server. The admin account is preserved automatically.

2. **Seed Basic Taxonomy**:

   ```bash
   node seeding_scripts/00_taxonomy_categories_flow/bot.js
   ```

   > You need the basic categories posted to the DB so developers can submit models under these categories.

3. **Create Your Developer Account**:
   - **Verification**: Submit ID docs -> Wait for Admin Approval -> Verified.
     You can manually log in as Admin and approve, OR run:

     ```bash
     node seeding_scripts/dev_tools/approve_pending_verifications.js --email=you@example.com
     ```

   - Complete the profile info.
   - **Stripe Connect**: Connect Stripe (real or demo flow) before requesting payouts.

4. **Create Client Account** & **Start Transactions** (track the flow using admin/developer/client accounts).

---

## 2. LOCAL ENVIRONMENT WITH DOCKER

1. **Deploy**:
   Run this in BOTH backend and frontend terminals:

   ```bash
   ./deploy.dev.sh
   ```

> Seeding process is identical to the Local Environment.

---

## 3. PRODUCTION ENVIRONMENT WITH DOCKER

1. **Deploy**:
   When CI/CD is ready, this will run automatically (`./deploy.sh`).
   To run manually, SSH into the VM/VPS and run on both terminals:

   ```bash
   ./deploy.sh
   ```

> Seeding process is similar, BUT with the following changes:

- Make sure to change the URLs from `localhost` to your server IP.
- **Forward Seeding from Local Machine**: Update `API_URL` to point to production, then run `node seeding_scripts/run_all.js` locally.
- **Cleaners/Database Resets**: MUST run directly on the VPS (Requires Prisma DB Access):
  To wipe EVERYTHING EXCEPT the Admin:

  ```bash
  docker exec -it modellink_backend node seeding_scripts/db_cleaners/clean_all.js --confirm
  ```

  To only reset/delete records created by the seeding bot itself:

  ```bash
  docker exec -it modellink_backend node seeding_scripts/run_all.js reset
  ```

---

## 4. STRIPE WEBHOOKS

### Local Stripe CLI Hooks (For Testing)

Get keys from: [Stripe Dashboard](https://dashboard.stripe.com/acct_1TktK1FEcNq1kJgZ/test/apikeys)

In your terminal, run:

```bash
stripe login
stripe listen --forward-to localhost:8000/api/orders/stripe-webhook
```

### Production Stripe Webhooks

For production, do **NOT** use the Stripe CLI.
Go to your Stripe Dashboard -> Developers -> Webhooks.
Add an endpoint pointing directly to:
`https://api.yourdomain.com/api/orders/stripe-webhook`

---

## 🗂️ SEEDING ENGINE

### 1. Main Seeding Engine Commands (Orchestrator)

> Prerequisite: API server running on `http://localhost:8000` (bootstrap admin from `.env` ADMIN_EMAIL / ADMIN_PASSWORD).

```bash
# To reset all files (input + db data) for any flow:
./seeding_scripts/reset_seed_inputs.sh

# Full reset + full run (recommended — verified green path):
node seeding_scripts/run_all.js reset && node seeding_scripts/run_all.js

# Run all 9 flows in order:
node seeding_scripts/run_all.js

# Run specific flow(s) only (e.g., 03, or 05 06 07):
node seeding_scripts/run_all.js 03

# Reset all flows (reverse order, safe cascade):
node seeding_scripts/run_all.js reset
```

> Note: After running `clean_all.js --confirm`, you MUST run `run_all.js reset && run_all.js`.

### 2. Seeding Flows Reference & Local Runners

- **[Flow 00] — Taxonomy & Categories**
  - **Run**: `node seeding_scripts/00_taxonomy_categories_flow/bot.js`
  - **Purpose**: Seeds parent/subcategories, Modalities, BodyParts.
- **[Flow 01] — Authentication & Profile Setup**
  - **Run**: `node seeding_scripts/01_auth_profile_flow/bot.js`
  - **Purpose**: Registers 3 clients + 3 developers.
- **[Flow 02] — Developer Verification**
  - **Run**: `node seeding_scripts/02_developer_verification_flow/bot.js`
  - **Purpose**: Submits verification documents (PENDING).
- **[Flow 02b] — Admin Verification Approve**
  - **Run**: `node seeding_scripts/02_developer_verification_flow/admin_approve.js`
- **[Flow 03] — Model Publishing (30-model catalog)**
  - **Run**: `node seeding_scripts/03_model_publishing_flow/bot.js`
- **[Flow 03b] — Model Versions**
  - **Run**: `node seeding_scripts/03b_model_versions_flow/bot.js`
- **[Flow 04] — Client Discovery**
  - **Run**: `node seeding_scripts/04_client_discovery_flow/bot.js`
- **[Flow 05] — Order, Payment, Delivery & Dispute**
  - **Run**: `node seeding_scripts/05_order_transaction_flow/bot.js`
- **[Flow 06] — Payout Lifecycle**
  - **Run**: `node seeding_scripts/06_payout_lifecycle/bot.js`
- **[Flow 07] — Admin Edge Cases**
  - **Run**: `node seeding_scripts/07_admin_edge_cases/bot.js`

### 3. Granular Database Cleaners (Isolated Resets)

⚠️ **IMPORTANT**: All cleaners must be run from a machine with direct network access to the PostgreSQL database (e.g., directly via SSH on the VPS) with the correct `DATABASE_URL`.

| Command                                                   | Impacted Prisma Models                   |
| :-------------------------------------------------------- | :--------------------------------------- |
| `node seeding_scripts/db_cleaners/clean_all.js --confirm` | ⚠️ Everything EXCEPT Admin               |
| `node seeding_scripts/db_cleaners/clean_models.js`        | All AiModels + versions/features/metrics |
| `node seeding_scripts/db_cleaners/clean_orders.js`        | All Orders + transactions + reviews      |
| `node seeding_scripts/db_cleaners/clean_users.js`         | All Users + cascades                     |
| `node seeding_scripts/db_cleaners/clean_verifications.js` | All verifications                        |
| `node seeding_scripts/db_cleaners/clean_wallets.js`       | All wallets + payouts                    |
| `node seeding_scripts/db_cleaners/clean_notifications.js` | All notifications                        |
| `node seeding_scripts/db_cleaners/clean_conversations.js` | All conversations + messages             |
| `node seeding_scripts/db_cleaners/clean_reviews.js`       | All reviews                              |
| `node seeding_scripts/db_cleaners/clean_taxonomy.js`      | Categories, Modalities, BodyParts        |

### 4. Dev Tools Flags

```bash
# Approve every pending verification
node seeding_scripts/dev_tools/approve_pending_verifications.js

# Approve only your account
node seeding_scripts/dev_tools/approve_pending_verifications.js --email=you@example.com

# List without approving
node seeding_scripts/dev_tools/approve_pending_verifications.js --list
```

---

## 🔬 Testing

```bash
cd modelLink_server && npm test
```

> Note: Tests hit `http://localhost:8000` — start the server first. They seed isolated test users/orders and clean up after themselves.

| Test File                           | Coverage                                                 |
| :---------------------------------- | :------------------------------------------------------- |
| `health.test.js`                    | Root + `/api/health`                                     |
| `users.test.js`                     | Public profiles, developers list, authenticated `/users` |
| `aiModelCatalog.test.js`            | Model list, filters, detail, byUser, versions            |
| `orderLifecycle.test.js`            | Create intent → webhook → get order → deliver            |
| `walletPayout.test.js`              | Wallet me/transactions, payout request/approve           |
| `disputeAdmin.test.js`              | Disputes + admin settings, audit logs, webhooks          |
| `taxonomy.test.js`                  | Public taxonomy + admin category CRUD/impact             |
| `messaging.test.js`                 | Conversations create/list, messages send/list            |
| `supportStripeVerification.test.js` | Support contact, Stripe Connect demo, verifications      |
| `reviewByModel.test.js`             | Public + authenticated reviews by model                  |

---

## 🧪 Postman Collection

**Path:** `modelLink_planning/reference/ModelLink.postman_collection.json`
> 116 requests across 17 folders, aligned with all current routes.

- **Automated Workflows**: Login saves `jwt_token`, `user_id`. Logout clears them. Creating entities automatically saves IDs.
- **Variables**: `base_url`, `jwt_token`, `user_id`, `model_id`, `order_id`, etc.

**How to use:**

1. Import `ModelLink.postman_collection.json` into Postman.
2. Confirm `base_url` variable is set to `http://localhost:8000/api`.
3. Run `1. Auth → Login`.
4. Run other requests! IDs will chain automatically via test scripts.

> To regenerate: `node modelLink_planning/reference/generate-postman-collection.js`
