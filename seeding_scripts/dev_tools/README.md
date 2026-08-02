# Dev Tools

Standalone scripts for local testing — **not** part of the full `run_all.js` pipeline.

## Approve pending developer verifications

After you register as a developer and submit verification documents in the UI, run:

```bash
cd modelLink_server
node seeding_scripts/dev_tools/approve_pending_verifications.js
```

This logs in as admin and approves **every** pending verification request.

### Options

| Flag / env | Purpose |
|------------|---------|
| `--email=you@example.com` | Approve only that developer's pending request (with status diagnostics if none found) |
| `--list` | Show all PENDING verifications in the admin queue |
| `--dry-run` | List matches without approving |
| `API_URL` | Default: `http://localhost:8000/api` |
| `ADMIN_EMAIL` | Default: `admin@modelLink.com` |
| `ADMIN_PASSWORD` | Default from taxonomy `data_reference.json` |

### Troubleshooting “No matching PENDING verifications”

The script now looks up your account directly and prints why nothing was approved:

| Message | What to do |
|---------|------------|
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
|--------|--------|
| `dev_tools/approve_pending_verifications.js` | **All** pending verifications (for manual dev testing) |
| `02_developer_verification_flow/admin_approve.js` | **Seed devs only** (`seed_dev_01/02/03`) — safe for full seed runs |

Admin credentials (default): `admin@modelLink.com` / `A@1234567891a`
