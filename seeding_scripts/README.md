# ModelLink Seeding System
## Architecture Reference & Executor Briefing

---

## The Problem This Solves

Manual testing requires logging in and out of multiple accounts, uploading files by hand,
and hoping you click everything in the right order. When something breaks, you cannot tell
if the bug is in the frontend, the backend, or the data itself.

This system replaces that chaos with a **chronologically ordered, repeatable, environment-aware
bot system** that simulates real user journeys from a single command.

---

## System Architecture

```
seeding_scripts/
│
├── README.md                          ← You are here. Master briefing doc.
│
├── 01_auth_profile_flow/              ← Registration, Login, Profile Setup
│   ├── flow_map.md                    ← DB field → API payload mapping
│   ├── data_reference.json            ← IMMUTABLE master actor definitions
│   ├── data_input.json                ← CONSUMABLE session queue (copy from reference)
│   └── bot.js                         ← [TO BUILD] Executor for this flow
│
├── 02_developer_verification_flow/    ← Document submission → APPROVED → Wallet created
│   ├── flow_map.md
│   ├── data_reference.json
│   ├── data_input.json
│   └── bot.js                         ← [TO BUILD]
│
├── 03_model_publishing_flow/          ← Model catalog seeding (extends seed_models_bot.js)
│   ├── flow_map.md
│   ├── data_reference.json            ← Full model catalog definitions
│   ├── data_input.json                ← Queue consumed by bot (removed on success)
│   └── bot.js                         ← [TO BUILD] (refactor of seed_models_bot.js)
│
├── 03b_model_versions_flow/           ← Multi-version model seeding
│   ├── flow_map.md
│   ├── data_reference.json
│   ├── data_input.json
│   └── bot.js                         ← Execution logic for generating extra versions
│
├── 04_client_discovery_flow/          ← Search & filter test battery
│   ├── flow_map.md
│   ├── data_reference.json            ← Query definitions with assertions
│   ├── data_input.json                ← Session state (read-only flow)
│   └── bot.js                         ← [TO BUILD]
│
├── 05_order_transaction_flow/         ← Order → Stripe → Wallet → Review
│   ├── flow_map.md
│   ├── data_reference.json            ← Order definitions + financial formula reference
│   ├── data_input.json                ← Consumable order queue
│   └── bot.js                         ← [TO BUILD]
│
└── data/                              ← Shared media assets
    ├── MODELS/                        ← Cover images for model seeding (jpg, png, webp)
    ├── CATEGORIES/                    ← Category SVG/PNG icons
    ├── seed_models.json               ← Legacy master payload (kept for reference)
    └── failed_seed_models.json        ← Legacy active queue (kept for reference)
```

---

## The Two-File Data Pattern (Immutable Reference vs Consumable Input)

Every flow uses two data files. This pattern is critical:

### `data_reference.json` — The Master Copy
- **NEVER deleted or modified by any bot script**
- Contains the complete, canonical definition of all actors and data for that flow
- Treated like a `seed.sql` — your ground truth
- When you need to start a **new environment** (staging, production test):
  1. `cp data_reference.json data_input.json`
  2. Run the bot

### `data_input.json` — The Active Session Queue
- **CONSUMED by the bot** — entries are removed upon successful processing
- If the bot crashes mid-run, only the remaining (failed) entries stay in the file
- Re-running the bot resumes from where it left off automatically
- In the Queue-based flows (01, 03, 05): starts as `[]`, bot copies from reference if empty
- In the Read-only flow (04): starts as `{}`, reset just clears session tokens

---

## Chronological Flow Order (Never Skip Steps)

```
[FLOW 01] Auth & Profile Setup
    ↓  (actors created)
[FLOW 02] Developer Verification & Wallet
    ↓  (isVerified = true, Wallet created)
[FLOW 03] Model Publishing
    ↓  (≥4 PUBLISHED models exist)
[FLOW 03b] Model Versions
    ↓  (Models receive multiple versions)
[FLOW 04] Client Discovery & Filter Testing  ← can run in parallel with 05
    ↓
[FLOW 05] Order, Payment & Ledger
    ↓  (full financial lifecycle complete)
```

---

## Environment Switching

The `env.API_URL` inside each `data_reference.json` is the single config point:

```json
{
  "env": {
    "API_URL": "http://localhost:8000/api"     ← development
  }
}
```

Switch environments by editing `data_input.json` (never `data_reference.json`):
```json
{
  "env": {
    "API_URL": "https://api.modellink.com/api"  ← production
  }
}
```

Or pass as env variable in the bot: `API_URL=https://... node bot.js`

---

## 🚨 Execution Context: API vs Prisma (Local vs Remote)

It is critical to understand *how* the different scripts interact with the backend, especially when running against a remote production server:

1. **Forward Seeding (`bot.js` scripts)**
   - **Mechanism:** Standard HTTP API calls.
   - **Environment:** Runs flawlessly across the internet from any laptop.
   - **Config:** Uses `API_URL`.

2. **Database Reset & Cleaners (`reset.js` & `db_cleaners/*.js`)**
   - **Mechanism:** Direct Database Connection via `PrismaClient` (e.g. `prisma.user.deleteMany()`).
   - **Environment:** Must be run where `DATABASE_URL` is accessible. Usually, this means they **must be run locally on the VPS** (via SSH) so Prisma can reach `localhost:5432`.
   - **Warning:** Running `node run_all.js reset` on your laptop while targeting production will fail with `Can't reach database server` because Prisma will look for a database on your laptop, not the VPS.

---

## Dev Tools (manual testing)

Scripts under `dev_tools/` are **not** run by `run_all.js`. Use them when testing locally.

**Approve your developer verification without the admin UI:**

```bash
node seeding_scripts/dev_tools/approve_pending_verifications.js
node seeding_scripts/dev_tools/approve_pending_verifications.js --email=you@example.com
```

See `dev_tools/README.md` for full options. Flow 02b (`admin_approve.js`) only approves seed dev accounts; use the dev tool for personal test accounts.

---

## Reset Strategy Per Flow

Each flow has a `reset.js` that:
1. Identifies records by the actors defined in `data_input.json`
2. Deletes **only those records** — does not wipe the full DB
3. Respects Prisma's cascade order (children before parents)
4. Copies `data_reference.json` → `data_input.json` to reset the queue

Run a specific flow reset:
```bash
node seeding_scripts/01_auth_profile_flow/reset.js
node seeding_scripts/03_model_publishing_flow/reset.js
```

Run a full system reset (all flows, in reverse order):
```bash
node seeding_scripts/05_order_transaction_flow/reset.js
node seeding_scripts/03_model_publishing_flow/reset.js
node seeding_scripts/01_auth_profile_flow/reset.js
```

---

## Executor Briefing (For the Bot Builder)

When implementing each `bot.js`, follow this contract:

1. **Read `data_input.json`** — if empty/`[]`, copy from `data_reference.json` first
2. **Authenticate** — login with actor credentials, store JWT in memory
3. **Execute each step** in the exact order defined in `flow_map.md`
4. **On success** — remove the processed item from `data_input.json`
5. **On failure** — leave the item in `data_input.json`, log the error, continue with next
6. **On completion** — print a summary: `✅ X succeeded | ❌ Y failed | ⏭️ Z skipped`
7. **Never mutate `data_reference.json`**

---

## Bug Localization Matrix

When a flow fails, use this table to determine where the bug is:

| Symptom | Likely Location |
|---|---|
| Flow 01 fails at registration | Backend `auth.controller.js` or DB constraint |
| Flow 01 succeeds but JWT invalid | Backend `auth.middleware.js` or token config |
| Flow 02 stuck at PENDING forever | `submitVerification` setTimeout or Prisma transaction |
| Flow 02 Wallet not created | Same — the `$transaction` in the setTimeout is failing silently |
| Flow 03 model created but images broken | `FILES_BASE_API_URL` config or `galleryImages` path logic |
| Flow 04 filter returns wrong results | `ApiFeaturesHelpersForAiModels.js` query builder |
| Flow 04 empty results despite data existing | Missing or wrong DB index |
| Flow 05 Order stays PENDING | Stripe webhook not firing or not processed |
| Flow 05 Wallet balance not updated | `$transaction` in webhook handler rollback |
| Flow 05 Review fails | `Review.@@unique([aiModelId, clientId])` constraint |
