# Flow 06 — Payout Lifecycle (Wallet Withdrawal)

> **Source Tables:** `Wallet`, `DeveloperPayout`, `WalletTransaction`, `User`  
> **Bot Script:** `06_payout_lifecycle/bot.js`  

---

## Purpose

Simulates a verified developer requesting a withdrawal of their available wallet balance, followed by an Admin reviewing and approving that payout request.

This tests the end-to-end ledger integrity: ensuring funds move out of `availableBalance` correctly and the payout request transitions to a completed state.

---

## Actors

| Actor    | Role                 | Action                                |
| :------- | :------------------- | :------------------------------------ |
| `dev_01` | DEVELOPER (verified) | Requests payout of available balance. |
| `admin`  | ADMIN                | Approves the requested payout.        |

---

## Step-by-Step Journey

### Phase 1 — Request Payout (Developer)

**1. Fetch Current Wallet Balance**
**API:** `GET /api/wallets/me`
**Headers:** `Authorization: Bearer {dev_token}`
**Action:** The bot retrieves the current `availableBalance` for the logged-in developer.

**2. Submit Payout Request**
**API:** `POST /api/payouts/request`
**Headers:** `Authorization: Bearer {dev_token}`
**Payload:**

```json
{
  "amount": <availableBalance>
}
```

**Action:** The bot requests to withdraw the entire available balance.

**Expected DB side-effects (from `requestPayout`):**

- `Wallet.availableBalance` is **immediately** decremented by the payout amount.
- A `DeveloperPayout` record is created with status `PENDING`.
- A `WalletTransaction` record is created with type `PAYOUT` and a negative amount.
- *Note: Funds do NOT move into `pendingBalance`.*

---

### Phase 2 — Approve Payout (Admin)

**API:** `PATCH /api/payouts/:id/approve`
**Headers:** `Authorization: Bearer {admin_token}`
**Action:** The Admin approves the specific payout request created in Phase 1.

**Expected DB side-effects:**

- `DeveloperPayout` status updates to `PAID`.
- (External Stripe transfers are initiated, if configured).

---

### Phase 3 — Verify Final State

**API:** `GET /api/wallets/me`
**Headers:** `Authorization: Bearer {dev_token}`
**Action:** The bot fetches the wallet again to assert that the `availableBalance` is now exactly `0`.
