# 05 — Feature Deep Dives & Low-Level Design (LLD)

> **Repository**: [`modelLink_server`](../README.md)  
> **Scope**: Implementation deep dives for Stripe Connect, Socket.io messaging, Search/Filtering, and Review system.

---

## 5.1 Stripe Connect & Dual-Mode Payment Engine

### 5.1.1 Production Stripe Connect Express + PaymentIntent Flow

- **Developer Onboarding**: Developers request onboarding links via `POST /api/stripe/connect/onboard`. Returns a Stripe-hosted `accountLink.url` for Express onboarding. Once completed, Stripe sends `account.updated` webhooks updating `stripeDetailsSubmitted` and `stripeChargesEnabled` on the `User` model.
- **Payment Flow**: Orders are created via `POST /api/orders/create-payment-intent` which creates a Stripe `PaymentIntent` and returns a `clientSecret`. The frontend uses **Stripe Elements** to render the card form and confirm payment client-side. On success, Stripe fires a webhook.
- **Webhook Listener**: Mounted on `POST /api/orders/stripe-webhook` (raw body preserved via `req.rawBody`). Verifies Stripe webhook signatures using `process.env.STRIPE_WEBHOOK_SECRET` or `STRIPE_LOCAL_WEBHOOK_SECRET`. Handles event `payment_intent.succeeded` (extracts `paymentIntent.id`, looks up Order by `stripePaymentIntentId`, calls `fulfillOrder()`). Also handles `account.updated` to sync Stripe Connect status.

### 5.1.2 Portfolio Demo Mode Bypass

- Demo mode is **not** controlled by an environment flag. The `MARKETPLACE_DEMO` env variable has been removed from the codebase.
- Any authenticated buyer with a PENDING order can call `POST /api/orders/:id/demo-checkout`, which instantly fulfills the order using the same `fulfillOrder()` function.
- The `completeConnectDemo` endpoint (`POST /api/stripe/connect/complete-demo`) simulates Stripe onboarding completion for developers in non-production environments (`NODE_ENV !== 'production'`).
- Executes identical atomic transaction logic via `fulfillOrder()` as production webhooks, granting instant access to model download assets without contacting external Stripe servers.

---

## 5.2 Real-Time Socket.io Messaging Architecture

- **Implementation**: [`server.js`](../server.js) (Socket.io `Server` instance inline), [`controller/conversation.controller.js`](../controller/conversation.controller.js).
- **Socket.io Path**: `/api/socket.io/` (custom path configured in `new Server(server, { path: '/api/socket.io/' })`). Nginx proxies requests at `location /socket.io/` through to the backend.
- **Authentication**: JWT passed via `socket.handshake.auth.token` (not query-string). Server verifies with `jwt.verify(token, ACCESS_SECRET_STR)`.
- **Room Architecture**: Rooms are per-user (`{userId}__room`), not per-conversation. All notifications and messages for a user are routed through their personal room.
- **Deterministic PairKey**: 1:1 chat channels use a pre-sorted unique pair key:

  ```js
  const buildPairKey = (idA, idB) => [idA, idB].sort().join("_");
  ```

- **Event Listeners** (server-side):
  - `joinRoom`: User joins their own `{userId}__room`. Server broadcasts updated `activeUsers` list via `get-users`.
  - `msg_created`: Client notifies server a message was created (`forId`, `message`). Server emits `receive_msg` to `{forId}__room`.
  - `typing` / `stopTyping`: Typing indicator forwarded to recipient's room.
  - `refreshModel` / `new_model`: Model catalog broadcast events.
  - `leavingRoom` / `disconnect`: Removes user from `activeUsers` and re-broadcasts.

---

## 5.3 Catalog Search & Dynamic Filtering Engine

- **Implementation**: [`utils/normalizeFilterQuery.js`](../utils/normalizeFilterQuery.js), [`utils/ApiFeatures.js`](../utils/ApiFeatures.js).
- Supports dynamic search filtering by:
  - `search`: Case-insensitive title and description matching.
  - `categoryId`: Filters models by taxonomy hierarchy (including subcategories).
  - `minPrice` & `maxPrice`: Range filtering.
  - `minRating`: Filters by aggregated review score.
  - `modality` & `tags`: Lookup table filtering.
