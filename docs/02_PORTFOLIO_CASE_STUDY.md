# 02 — Senior Engineering Portfolio Case Study

> **Author**: Ahmed Manakhly ([manakhly.tech](https://manakhly.tech) | [GitHub Profile](https://github.com/Ahmed-Manakhly))  
> **Project**: ModelLink AI Marketplace System Architecture  
> **Role**: Lead Systems Architect & Full-Stack Engineer

---

## 2.1 Project Context & Executive Summary

ModelLink was designed to address a critical friction point in the AI ecosystem: enabling AI engineers and researchers to package, version, and monetize proprietary models, datasets, and API endpoints without relying on centralized SaaS monoliths.

As Lead Systems Architect, my objective was to design a production-grade software marketplace capable of operating on single-host VPS infrastructure with enterprise-level security, complete financial ledger accountability, real-time communication, and zero-downtime containerized CI/CD.

---

## 2.2 Core Engineering Challenges & Solutions

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                      4 Major Engineering Challenges                     │
├──────────────────┬──────────────────────────────────────────────────────┤
│ Challenge        │ Technical Solution                                   │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 1. Stripe KYC    │ Dual-Path Payment Architecture with shared atomic    │
│    Friction      │ fulfillOrder() settlement core                       │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 2. Real-Time     │ Ref-based event delegation pattern + sorted pairKey │
│    Deduplication │ database constraints                                 │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 3. Container     │ 3 custom AppArmor security profiles + su-exec        │
│    Breakouts     │ privilege dropping to UID 1001                       │
├──────────────────┼──────────────────────────────────────────────────────┤
│ 4. Financial     │ Immutable WalletTransaction ledger with Prisma       │
│    Ledger Safety │ $transaction atomic blocks                           │
└──────────────────┴──────────────────────────────────────────────────────┘
```

### Challenge 1: Frictionless Demonstration vs. Strict Production Payments

- **The Problem**: Real payment infrastructure (Stripe Connect Express) requires creators to submit real Tax IDs and complete bank onboarding before receiving funds. However, portfolio reviewers and prospective employers need to test marketplace purchases immediately without entering real credit cards.
- **The Solution**: I designed a **Dual-Path Payment Architecture**. Both real Stripe webhook triggers (`payment_intent.succeeded`) and portfolio demo triggers (`POST /api/orders/:id/demo-checkout`) converge on a single, shared internal function: `fulfillOrder()`. This guarantees that 100% of the financial transaction logic, wallet adjustments, and asset delivery pipelines are executed identically in both modes.

### Challenge 2: Container Security on Shared VPS Infrastructure

- **The Problem**: Deploying PostgreSQL, Nginx, pgAdmin, and Express inside Docker on a single VPS poses container breakout risks if a service is compromised.
- **The Solution**: I authored 3 custom Linux AppArmor security profiles (`modellink-restrict-db`, `modellink-restrict-nginx`, `modellink-restrict-pgadmin`). Combined with non-root user execution (`modelLink`, UID `1001`) via `su-exec` in Docker entrypoints, containers are barred from executing host mounts or escalating kernel privileges.

---

## 2.3 Key Technical Decisions & Architectural Trade-offs

### Decision 1: Modular Monolith vs. Microservices

- **Trade-off**: Microservices offer independent deployment but introduce massive network latency, distributed transaction complexity, and high RAM overhead.
- **Choice**: I chose a **Modular Monolith** architecture. Backend logic is divided into decoupled domain modules (Auth, Catalog, Wallet, Order, Messaging, Dispute). Shared database access is wrapped in Prisma `$transaction` blocks. This allows running the entire stack under 2GB RAM on a VPS while maintaining clean internal boundaries.

### Decision 2: Pure HTTP Bearer Token vs. HTTP-Only Cookies

- **Trade-off**: HTTP-only cookies provide automatic CSRF protection, but present cross-domain CORS challenges when mobile apps or external integrations consume the API.
- **Choice**: Implemented **Pure HTTP Bearer Tokens**. Tokens are passed in `Authorization: Bearer <token>` headers (or `?token=` for WebSocket connections). Cookie-setting code in `createSendToken` was explicitly disabled to enforce an un-opinionated API layer suitable for multi-client consumption.

---

## 2.4 Scalability & Performance Analysis

1. **Database Query Optimization**:
   - `Order` queries use explicit index `@@index([versionId])`.
   - `Conversation` queries look up pre-sorted `pairKey` strings (`@@unique([pairKey])`), reducing 1:1 chat queries from multi-table joins to an $O(1)$ index lookup.
2. **Pino Structured Log Streaming**:
   - Replaced heavy synchronous logging with worker-thread asynchronous streaming using `pino` and `pino-roll`. Daily log rotation prevents disk overflow on long-running VPS deployments.

---

## 2.5 Engineering Lessons Learned

1. **Idempotency is Non-Negotiable**: Stripe webhooks can fire duplicate events. Enforcing `WebhookEventStatus` logging in the database ensures duplicate webhooks are safely ignored without double-crediting balances.
2. **Environment Parity**: Using Docker Compose for both development (`docker-compose.dev.yml`) and production (`docker-compose.yml`) eliminated "works on my machine" bugs across local Linux/macOS machines and production VPS environments.
