# Dev Tools

Standalone scripts for local testing — **not** part of the full `run_all.js` pipeline.

## Approve pending developer verifications

After you register as a developer and submit verification documents in the UI, run:

```bash
cd modelLink_server
node seeding_scripts/dev_tools/approve_pending_verifications.js
```

This logs in as admin and approves **every** pending verification request.

### Command Options

Instead of a generic run, you can pass specific flags to change how the script operates:

#### 1. The Default Run

```bash
node seeding_scripts/dev_tools/approve_pending_verifications.js
```

**What it does:** It logs in as the Admin in the background, finds **ALL** users who currently have a "PENDING" verification status, and approves every single one of them at once.

#### 2. The Targeted Run (`--email`)

```bash
node seeding_scripts/dev_tools/approve_pending_verifications.js --email=you@example.com
```

**What it does:** If you have multiple pending developers but only want to approve one specific account (for instance, the one you are currently testing), you pass the `--email` flag. It will ignore everyone else and only approve the account matching that exact email.

#### 3. The List Run (`--list`)

```bash
node seeding_scripts/dev_tools/approve_pending_verifications.js --list
```

**What it does:** This is a "read-only" command. It logs in and fetches all the pending verifications, then simply prints their emails and IDs to your terminal so you can see who is waiting. **It does not approve anyone.**

#### 4. The Dry Run (`--dry-run`)

```bash
node seeding_scripts/dev_tools/approve_pending_verifications.js --dry-run
```

**What it does:** This is a safe "practice" run. It runs through the entire script, finds the pending accounts, and prints out messages like *"Would approve user X"* to the terminal, but it stops right before actually making the API calls to approve them. It’s useful to double-check what the script *is going to do* before you actually let it do it!

### Environment Variables

| Env Variable | Purpose |
| ------------ | --------- |
| `API_URL` | Default: `http://localhost:8000/api` |
| `ADMIN_EMAIL` | Default: `admin@modelLink.com` |
| `ADMIN_PASSWORD` | Default from taxonomy `data_reference.json` |

### Troubleshooting “No matching PENDING verifications”

The script now looks up your account directly and prints why nothing was approved:

| Message | What to do |
| --------- | ------------ |
| No user found | Register with that email first |
| Role is CLIENT | Sign up as **DEVELOPER** |
| No verification record | Profile Settings → upload doc → Submit Verification |
| PENDING but no document | Upload failed or not submitted — try again in Profile Settings |
| Already APPROVED | You're verified; refresh the app |
| REJECTED | Re-submit a corrected document, then run the script again |

Inspect the admin queue:

```bash
node seeding_scripts/dev_tools/approve_pending_verifications.js --list
```

### vs Flow 02b (`admin_approve.js`)

| Script | Scope |
| -------- | -------- |
| `dev_tools/approve_pending_verifications.js` | **All** pending verifications (for manual dev testing) |
| `02_developer_verification_flow/admin_approve.js` | **Seed devs only** (`seed_dev_01/02/03`) — safe for full seed runs |

Admin credentials (default): `admin@modelLink.com` / `A@1234567891a`
