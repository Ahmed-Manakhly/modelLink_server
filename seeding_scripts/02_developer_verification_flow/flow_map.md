# Flow 02: Developer Verification & Wallet Provisioning

> **Source Tables:** `DeveloperVerification`, `Wallet`, `WalletTransaction`, `Notification`, `User`  
> **Bot Script:** `02_developer_verification_flow/bot.js`  
> **Data Input:** `02_developer_verification_flow/data_input.json`  
> **Data Reference:** `02_developer_verification_flow/data_reference.json`  
> **Reset Script:** `02_developer_verification_flow/reset.js`

---

## Purpose

Simulate the governance gate that every DEVELOPER must pass before publishing models.
This tests the full `PENDING → APPROVED` state machine, the system notification, and the
automatic creation of the developer's `Wallet` (zero-balance) upon approval.

> ⚠️ **Prerequisite:** Flow 01 must have completed successfully. Developer JWT tokens must be available.

---

## Actors

| Actor              | Role                            | Action                       |
| :----------------- | :------------------------------ | :--------------------------- |
| `dev_01`, `dev_02` | DEVELOPER                       | Submits identity documents   |
| `SYSTEM`           | Auto-scheduler (setTimeout 30s) | Approves + provisions Wallet |

---

## State Machine: `DeveloperVerification.status`

```text
[Registration] ──► PENDING ──► APPROVED ──► (can publish models)
                        └────► REJECTED ──► (can re-submit)
```

**DB Fields driving this machine:**

| Field             | Type                 | Meaning                                                           |
| :---------------- | :------------------- | :---------------------------------------------------------------- |
| `status`          | `VerificationStatus` | `PENDING` \| `APPROVED` \| `REJECTED`                             |
| `documentUrl`     | `String?`            | Relative path to uploaded doc (e.g. `verifications/1234_doc.pdf`) |
| `notes`           | `String?`            | Developer's optional cover note                                   |
| `rejectionReason` | `String?`            | Admin fills this on REJECTED                                      |
| `verifiedAt`      | `DateTime?`          | Set when status → APPROVED                                        |
| `createdAt`       | `DateTime`           | When doc was submitted                                            |

---

## Step-by-Step Journey

### STEP 1 — Developer Submits Verification Document

**API:** `POST /api/verifications/submit` (multipart/form-data)

**Headers:** `Authorization: Bearer {dev_token}`

**Payload:**

```json
{
  "data": {
    "notes": "Official company registration document."
  },
  "document": "<file from data_input.json > verification.documentFile>"
}
```

**Expected DB side-effects:**

- `DeveloperVerification` record created (or upserted):

  ```text
  { userId: dev.id, status: 'PENDING', documentUrl: 'verifications/<filename>', createdAt: now() }
  ```

- `User.isVerified` stays `false` at this point.

**Bot action:** Store `verification.id` in session state.

---

### STEP 2 — Auto-Approval (System, 30s timeout)

This is handled server-side by `setTimeout(30000)` inside `submitVerification` controller.
The bot waits `35s` then verifies the state flipped.

**DB mutations performed inside `prisma.$transaction()`:**

```js
// 1. Update verification record
DeveloperVerification.update({ status: "APPROVED", verifiedAt: new Date() });

// 2. Unlock the developer account
User.update({ isVerified: true });

// 3. Create the developer Wallet (zero balance)
Wallet.create({
  userId: dev.id,
  availableBalance: 0,
  pendingBalance: 0,
  totalEarnings: 0,
});

// 4. Create system notification
Notification.create({
  recipientId: dev.id,
  senderId: null, // null = system message
  actionDesc: "Your developer account has been approved!",
  actionLink: "/profileSettings",
  unRead: true,
});
```

**Bot Verification Check (after 35s wait):**

- `GET /api/verifications/me` → `status === 'APPROVED'`
- `GET /api/users` → `isVerified === true`

---

### STEP 3 — Wallet Existence Check

**API (internal/Prisma check):** Confirm `Wallet` record exists for each approved developer.

**Expected `Wallet` schema state:**

```json
{
  "id": "Int — auto-increment",
  "userId": "dev.id — @unique",
  "availableBalance": 0,
  "pendingBalance": 0,
  "totalEarnings": 0,
  "createdAt": "DateTime",
  "updatedAt": "DateTime"
}
```

---

## Reset Behaviour

`reset.js` runs:

```js
// Cascade handles Wallet and WalletTransactions
await prisma.developerVerification.deleteMany({
  where: { userId: { in: devIds } },
});
await prisma.wallet.deleteMany({ where: { userId: { in: devIds } } });
// Also clear notifications
await prisma.notification.deleteMany({
  where: { recipientId: { in: devIds } },
});
// Reset isVerified flag
await prisma.user.updateMany({
  where: { id: { in: devIds } },
  data: { isVerified: false },
});
```

This cascades to all child records due to `onDelete: Cascade` in the schema.

---

## Success Criteria

- [ ] `DeveloperVerification.status === 'APPROVED'` for all seeded developers
- [ ] `User.isVerified === true` for all seeded developers
- [ ] `Wallet` record exists with `availableBalance: 0`
- [ ] `Notification` record exists in DB for each developer
- [ ] `Notification.unRead === true`
