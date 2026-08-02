# Flow 01: Authentication & Profile Setup

> **Source Tables:** `User`, `EmailToken`
> **Bot Script:** `01_auth_profile_flow/bot.js`
> **Data Input:** `01_auth_profile_flow/data_input.json` (consumable, wiped on reset)
> **Data Reference:** `01_auth_profile_flow/data_reference.json` (immutable master copy)
> **Reset Script:** `01_auth_profile_flow/reset.js`

---

## Purpose
Simulate the complete first-contact journey for both a CLIENT and a DEVELOPER.
This flow tests the Registration → Email Verification → Login → Profile Completion chain.
If this flow breaks, NO other flow can run.

---

## Actors
| Actor | Role | Credential Source |
|---|---|---|
| `client_01` | CLIENT | `data_input.json > actors.clients[0]` |
| `dev_01` | DEVELOPER | `data_input.json > actors.developers[0]` |

---

## Step-by-Step Journey

### STEP 1 — Register (CLIENT)
**API:** `POST /api/auth/register`
**Payload fields mapped from `User` schema:**
```json
{
  "email":            "User.email          — @unique String",
  "password":         "User.password       — bcrypt hashed, min complexity enforced",
  "passwordConfirm":  "Validation only, not stored",
  "role":             "User.role           — must be 'CLIENT' for this actor",
  "org_username":     "User.org_username   — @unique, slug-style handle"
}
```
**Expected DB side-effects:**
- `User` record created with `isVerified: false`, `isActive: true`
- `customId` auto-generated (format: `CL0001`)
- `EmailToken` record created: `{ email, emailToken (UUID), isVerified: false, expiresAt: +1hr }`

**Bot action:** Store returned `token` and `user.id` in session state.

---

### STEP 2 — Register (DEVELOPER)
**API:** `POST /api/auth/register`
**Payload fields mapped from `User` schema:**
```json
{
  "email":            "User.email",
  "password":         "User.password",
  "passwordConfirm":  "validation",
  "role":             "'DEVELOPER'",
  "org_username":     "User.org_username   — @unique",
  "org_name":         "User.org_name       — company/studio name"
}
```
**Expected DB side-effects:** Same as CLIENT. `customId` format: `DEV0001`.

---

### STEP 3 — Login
**API:** `POST /api/auth/login`
**Payload:**
```json
{
  "email":    "User.email",
  "password": "User.password (plaintext, server compares with bcrypt hash)"
}
```
**Expected response fields to capture:**
```json
{
  "token":      "JWT — store for all subsequent requests",
  "data.user":  {
    "id":           "User.id (cuid)",
    "customId":     "User.customId",
    "role":         "User.role",
    "isVerified":   "User.isVerified — false until verification flow",
    "org_username": "User.org_username"
  }
}
```
**Bot action:** Update session state `{ token, userId, role }`.

---

### STEP 4 — Complete Profile (DEVELOPER only)
**API:** `PATCH /api/users` (multipart/form-data)
**Payload fields mapped from `User` schema:**
```json
{
  "data": {
    "first_name":  "User.first_name",
    "last_name":   "User.last_name",
    "country":     "User.country",
    "org_name":    "User.org_name",
    "org_desc":    "User.org_desc",
    "org_phone":   "User.org_phone"
  },
  "avatar": "User.avatar — file upload, stored as relative path e.g. 'assets/avatar.jpg'"
}
```
**Bot action:** POST the profile update. Read `logoUrl` from `data_input.json > actors.developers[0].profile.logoFile` and attach it as the `cover` file field.

---

## Reset Behaviour
`reset.js` runs:
```js
await prisma.emailToken.deleteMany({ where: { email: { in: allActorEmails } } });
await prisma.user.deleteMany({ where: { email: { in: allActorEmails } } });
```
This cascades to all child records due to `onDelete: Cascade` in the schema.

---

## Success Criteria
- [ ] Both CLIENT and DEVELOPER accounts exist in DB
- [ ] `User.isVerified = false` after this flow (verified in Flow 02)
- [ ] JWT tokens captured and valid
- [ ] `User.org_username` is unique and slug-formatted
