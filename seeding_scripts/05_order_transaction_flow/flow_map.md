# Flow 05: Order, Payment & Ledger (Stripe & Wallet Lifecycle)

> **Source Tables:** `Order`, `Transaction`, `Wallet`, `WalletTransaction`, `WebhookEvent`, `DeveloperPayout`, `Review`, `Notification`, `SystemSettings`
> **Bot Script:** `05_order_transaction_flow/bot.js`
> **Data Input:** `05_order_transaction_flow/data_input.json`
> **Data Reference:** `05_order_transaction_flow/data_reference.json`
> **Reset Script:** `05_order_transaction_flow/reset.js`

---

## Purpose
Simulate the full financial lifecycle of a marketplace purchase.
This tests the Stripe payment intent creation, webhook processing, ledger mutation,
asset unlock, and review submission — end-to-end.

> ⚠️ **Prerequisites:**
> - Flow 03 complete: Models exist with `status: PUBLISHED`
> - Flow 01 complete: Client account exists with valid JWT
> - `STRIPE_WEBHOOK_SECRET` must be **unset** in `.env` (mock webhook has no signature)

---

## Actors
| Actor | Role | Action |
|---|---|---|
| `client_01` | CLIENT | Creates payment intent, pays, reviews |
| `dev_01` | DEVELOPER | Receives payment, wallet is credited |
| `STRIPE` | External webhook | Fires `payment_intent.succeeded` event |
| `SYSTEM` | Platform | Calculates and records platform fee |

---

## The Complete Order State Machine

```
CLIENT creates intent ──► Order { status: PENDING }
         │
         ▼
Stripe payment confirmed
         │
         ▼
Webhook: payment_intent.succeeded ──► prisma.$transaction() ──►
         │
         ├── Order { status: PAID }
         ├── Transaction { grossAmount, platformFee, developerPayout }
         ├── Wallet { availableBalance += developerPayout }
         ├── WalletTransaction { type: SALE, amount: developerPayout }
         ├── ModelAsset UNLOCKED (client can now access)
         └── Notification → developer: "You have a new sale!"
         │
         ▼
CLIENT marks delivered ──► Order { status: DELIVERED }
         │
         ▼
CLIENT submits review ──► Review { star, desc }
         │             ──► AiModel { totalStars += star, starFrequency += 1, reviewCount += 1 }
         ▼
(Optional) CLIENT opens dispute ──► Dispute { status: OPEN }
```

---

## Step-by-Step Journey

### STEP 1 — CLIENT Initiates Checkout
**API:** `POST /api/orders/create-payment-intent`
**Headers:** `Authorization: Bearer {client_token}`
**Payload:**
```json
{
  "aiModelId":   "AiModel.id — from Flow 03",
  "versionId":   "AiModelVersion.id — the isPrimary version",
  "developerId": "User.id of the model owner"
}
```
**Server creates:**
```
Stripe PaymentIntent { amount: version.price * 100, currency: 'usd' }
```
**Response captures:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx — needed by Stripe.js on FE",
  "orderId":      "Order.id",
  "order": {
    "status":                 "PENDING",
    "purchasePrice":          "AiModelVersion.price",
    "stripePaymentIntentId":  "pi_xxx",
    "clientId":               "client_01.id",
    "developerId":            "dev_01.id",
    "aiModelId":              "model.id",
    "versionId":              "version.id"
  }
}
```

---

### STEP 2 — Stripe Webhook: `payment_intent.succeeded`
In the seeding bot, this is simulated by calling the internal webhook handler directly
OR by calling a test utility endpoint (if `NODE_ENV=test`).

**The webhook handler executes `prisma.$transaction()`:**

```js
// All-or-nothing atomic operation:

// 1. Record the raw webhook event
WebhookEvent.create({
  eventId:    "evt_xxx",
  eventType:  "payment_intent.succeeded",
  provider:   "stripe",
  rawPayload: { ... },
  status:     "RECEIVED"
})

// 2. Move order to PAID
Order.update({ status: "PAID" })

// 3. Calculate the financial split
const platformFeePercent = SystemSettings.platformFeeValue  // default: 20%
const platformFee        = Math.floor(grossAmount * (platformFeePercent / 100))
const developerPayout    = grossAmount - platformFee

// 4. Record the Transaction (immutable financial record)
Transaction.create({
  stripeEventId:   "evt_xxx",
  grossAmount:     order.purchasePrice,
  platformFee:     platformFee,
  developerPayout: developerPayout,
  currency:        "usd",
  orderId:         order.id
})

// 5. Update developer Wallet
Wallet.update({
  availableBalance: { increment: developerPayout },
  totalEarnings:    { increment: developerPayout }
})

// 6. Record ledger entry
WalletTransaction.create({
  walletId:      dev.wallet.id,
  type:          "SALE",
  amount:        developerPayout,
  description:   "Sale: {model.title}",
  referenceId:   order.id.toString(),
  referenceType: "ORDER",
  orderId:       order.id
})

// 7. Notify developer
Notification.create({
  recipientId: developerId,
  senderId:    clientId,
  actionDesc:  "New sale: {model.title} — ${developerPayout / 100}",
  actionLink:  "/orders/{orderId}",
  unRead:      true
})

// 8. Update model sales counter
AiModel.update({ sales: { increment: 1 } })

// 9. Mark WebhookEvent as processed
WebhookEvent.update({ status: "PROCESSED", processedAt: now() })
```

---

### STEP 3 — CLIENT Submits Review
**API:** `POST /api/reviews`
**Headers:** `Authorization: Bearer {client_token}`
**Payload mapped from `Review` schema:**
```json
{
  "orderId":   "Order.id — @unique, ensures 1 review per order",
  "aiModelId": "AiModel.id",
  "versionId": "AiModelVersion.id",
  "star":      "Int 1-5  — Review.star",
  "desc":      "String   — Review.desc"
}
```
**Server side-effects (in transaction):**
```js
Review.create({ clientId, aiModelId, versionId, orderId, star, desc })
AiModel.update({
  totalStars:    { increment: star },
  starFrequency: { increment: 1 },
  reviewCount:   { increment: 1 }
})
```

**Overall Rating formula (frontend):**
```
overallRating = AiModel.totalStars / AiModel.starFrequency
```

---

### STEP 4 — Verify Ledger (Bot Check)
```
GET /api/wallets/me (dev_01 token)
Expected:
  Wallet.availableBalance > 0
  Wallet.totalEarnings    > 0

GET /api/wallets/transactions (dev_01 token)
Expected:
  WalletTransaction[0].type   === 'SALE'
  WalletTransaction[0].amount === developerPayout
```

---

## Financial Formula Reference
```
grossAmount      = Order.purchasePrice (in dollars or cents — match your backend convention)
platformFeeValue = SystemSettings.platformFeeValue (default: 20)
platformFee      = floor(grossAmount × (platformFeeValue / 100))
developerPayout  = grossAmount - platformFee

Example: $299 purchase, 20% fee:
  platformFee     = floor(299 × 0.20) = $59
  developerPayout = 299 - 59         = $240
```

---

## Reset Behaviour
`reset.js` runs (children before parents):
```js
const orderIds = (await prisma.order.findMany({ where: { clientId: clientId } })).map(o => o.id);
await prisma.review.deleteMany({ where: { orderId: { in: orderIds } } });
await prisma.dispute.deleteMany({ where: { orderId: { in: orderIds } } });
await prisma.walletTransaction.deleteMany({ where: { orderId: { in: orderIds } } });
await prisma.transaction.deleteMany({ where: { orderId: { in: orderIds } } });
await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
// Reset wallet balances
await prisma.wallet.updateMany({ where: { userId: devId }, data: { availableBalance: 0, totalEarnings: 0 } });
// Reset model counters
await prisma.aiModel.updateMany({ where: { developerId: devId }, data: { sales: 0, totalStars: 0, starFrequency: 0, reviewCount: 0 } });
```

---

## Success Criteria
- [ ] `Order.status === 'PAID'` after webhook
- [ ] `Transaction` record exists with correct `platformFee` and `developerPayout`
- [ ] `Wallet.availableBalance` increased by exactly `developerPayout`
- [ ] `WalletTransaction` record of `type: 'SALE'` exists
- [ ] `WebhookEvent.status === 'PROCESSED'`
- [ ] `Review` record exists after client submits
- [ ] `AiModel.totalStars`, `.starFrequency`, `.reviewCount` all incremented
- [ ] `Notification` sent to developer after sale
