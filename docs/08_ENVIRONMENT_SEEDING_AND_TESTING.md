# 08 — Environment Operational Matrix, Seeding Engine & Integration Testing

> **Repository**: [`modelLink_server`](../README.md)  
> **Testing Stack**: Mocha, Chai, Supertest (16 Test Files)  
> **Seeding Engine**: Two-File Pattern (`data_reference.json` + `data_input.json`)

---

## 8.1 Three-Environment Operational Matrix

| Operational Environment | Database Host & Connection | Storage Path         | Stripe Mode                        | Script Target            |
| :---------------------- | :------------------------- | :------------------- | :--------------------------------- | :----------------------- |
| **1. Native Local**     | `localhost:5432`           | Local `./uploads`    | Demo path (`NODE_ENV=development`) | `npm start`              |
| **2. Docker Local**     | `postgres:5432` (Compose)  | Mounted `/public`    | Demo path (`NODE_ENV=development`) | `docker-compose.dev.yml` |
| **3. VPS Production**   | `postgres:5432` (Internal) | Docker Named Volumes | Live Stripe / Webhooks             | `deploy.sh`              |

---

## 8.2 Two-File Seeding Engine Architecture

**Directory**: [`seeding_scripts/`](../seeding_scripts)

The database seeding engine operates on a robust **Two-File Pattern** ensuring idempotency and environment safety:

1. **`data_reference.json` (Master Template)**: Immutable master record containing canonical taxonomy trees, test developer accounts, verified models, and sample reviews.
2. **`data_input.json` (Active Queue)**: Working seed queue file consumed during execution.
3. **Seeding Execution**:
   - **Full seed**: `node seeding_scripts/run_all.js` — runs all 9 flows sequentially.
   - **Reset + full seed**: `node seeding_scripts/run_all.js reset && node seeding_scripts/run_all.js`
   - **Specific flows**: `node seeding_scripts/run_all.js 03 05` (runs only flows 03 and 05).
   - **DB reset**: `node seeding_scripts/db_cleaners/clean_all.js --confirm`

> [!NOTE]
> There is no `npm run seed` script in `package.json`. All seeding commands invoke `node seeding_scripts/...` directly.

---

## 8.3 Integration Test Battery (Mocha / Chai / Supertest)

The repository includes **16 integration test files** in [`test/`](../test):

```bash
# Execute integration test battery
npm test
```

### Test Battery Breakdown

1. `aiModelCatalog.test.js`: Model catalog search, pagination, and category filtering.
2. `auth.test.js`: User registration, login, JWT validation, password update.
3. `disputeAdmin.test.js`: Dispute creation, admin arbitration, and refund wallet deductions.
4. `filters.test.js`: Complex multi-parameter search query normalization.
5. `health.test.js`: Healthcheck endpoint status.
6. `messaging.test.js`: Chat creation, `pairKey` deduplication, message persistence.
7. `orderActions.test.js`: Order checkout lifecycle actions.
8. `orderLifecycle.test.js`: End-to-end purchase fulfillment and wallet crediting.
9. `readState.test.js`: Chat message read status and unread counter assertions.
10. `review.test.js`: Review creation, average rating recalculation.
11. `reviewByModel.test.js`: Model-specific review fetching.
12. `supportStripeVerification.test.js`: Stripe account onboarding status logic.
13. `taxonomy.test.js`: Two-tier category creation and parent-child hierarchy checks.
14. `users.test.js`: User profile management and soft-deletion behavior.
15. `version.test.js`: Model versioning and delivery asset attachment.
16. `walletPayout.test.js`: Balance calculations and withdrawal payouts.
