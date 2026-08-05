# 01 — Project Overview

> **Repository**: [`modelLink_server`](../README.md)  
> **System Name**: ModelLink AI Marketplace Backend Engine  
> **Architecture Pattern**: Modular Monolith + Real-Time Engine & Dual Payment Infrastructure  
> **Live Production URL**: [https://www.modellink.manakhly.tech/](https://www.modellink.manakhly.tech/)

---

## 1.1 Executive Summary

**ModelLink** is an enterprise-grade, multi-tenant digital marketplace platform designed for hosting, versioning, monetizing, and trading artificial intelligence models, weights, datasets, and integration APIs.

It connects **AI Model Developers** (creators publishing semver-tagged model weights and access links) with **Enterprise Clients / AI Engineers** (buyers purchasing model licenses via secure financial checkout). The system is designed for multi-tenant deployment on resource-constrained Virtual Private Servers (VPS), offering zero-downtime containerized operations, real-time messaging, automated sitemaps, and defense-in-depth Linux kernel profiling.

---

## 1.2 Problem Statement & Value Proposition

### 1.2.1 The Engineering Challenge

- **Monetization & Trust Friction**: AI creators struggle to securely sell model weights and APIs with clear financial accountability, verified KYC identity, and automated payout infrastructure.
- **Resource Constraints**: Running complex marketplace software (database, proxy, real-time engines, caching, administrative tools) on low-cost single-host VPS servers requires strict containerized resource boundaries, non-root execution, and Linux kernel sandboxing.
- **Dual-Mode Operational Requirements**: A senior software engineering portfolio demonstration needs to showcase full production integration with third-party providers (e.g., Stripe Connect Express) while simultaneously offering an immediate, zero-friction "Portfolio Demo Mode" for reviewers to test end-to-end purchasing without real payment cards.

### 1.2.2 The ModelLink Solution

ModelLink solves these challenges through:

1. **Shared Atomic Settlement Engine (`fulfillOrder`)**: A unified financial order processing function used identically by real Stripe Webhooks and Portfolio Demo Bypasses.
2. **Immutable Wallet Transaction Ledger**: Append-only `WalletTransaction` tracking for `SALE`, `PAYOUT`, `REFUND`, `PLATFORM_FEE`, and `ADJUSTMENT`.
3. **Multi-Stage Linux Sandboxing**: AppArmor Linux security profiles bound to Docker containers preventing host privilege escalation.
4. **Deterministic Chat Channels**: Unique `pairKey` database constraints enforcing 1:1 participant isolation.

---

## 1.3 Target Audience & User Personas

| Role Enum       | Governance & Access Scope | Primary Actions                                                                                                             |
| :-------------- | :------------------------ | :-------------------------------------------------------------------------------------------------------------------------- |
| **`ADMIN`**     | Full System Scope         | Arbitrate disputes, approve developer payouts, review KYC applications, manage users, inspect audit logs.                   |
| **`EMPLOYEE`**  | Operational Support Scope | Review developer KYC applications, assist dispute arbitration, inspect model catalogs.                                      |
| **`DEVELOPER`** | Merchant & Author Scope   | Submit KYC verification, publish AI models/versions, manage wallet earnings, request payouts, chat with clients.            |
| **`CLIENT`**    | Buyer Scope               | Search/filter model catalog, add models to cart, execute checkout (Stripe or Demo), access purchased assets, open disputes. |

---

## 1.4 Technology Stack & Architectural Rationale

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                          ModelLink Technology Stack                     │
├───────────────────┬───────────────────┬─────────────────────────────────┤
│ Layer             │ Technology        │ Rationale                       │
├───────────────────┼───────────────────┼─────────────────────────────────┤
│ Runtime           │ Node.js v24       │ Asynchronous I/O performance    │
│ Web Framework     │ Express.js v4.18  │ Lightweight modular routing     │
│ Database Engine   │ PostgreSQL        │ Relational integrity & ACID     │
│ Database ORM      │ Prisma v5.19      │ Type-safe queries & migrations  │
│ Real-Time Layer   │ Socket.io v4.7    │ Bi-directional event transport  │
│ Payment Processor │ Stripe API v12    │ Connect Express payouts         │
│ Security Sandbox  │ AppArmor          │ Kernel-level container boundary │
│ Logging System    │ Pino & Pino-Roll  │ Structured JSON stream rotation │
│ Test Engine       │ Mocha, Chai       │ Integration test suite (16 test files)|
└───────────────────┴───────────────────┴─────────────────────────────────┘
```

---

## 1.5 Real Implementation & Feature Status Matrix

To guarantee strict compliance with empirical repository evidence, the feature set is categorized by true operational status:

### ✅ Fully Implemented & Code-Verified

- **Pure HTTP Bearer Token Authentication**: JWT sign/verify via `Authorization: Bearer <token>` header or `?token=` query param.
- **Immutable Wallet Transaction Ledger**: `Wallet` balance management with `WalletTransaction` tracking (`SALE`, `PAYOUT`, `REFUND`, `PLATFORM_FEE`, `ADJUSTMENT`).
- **Deterministic 1:1 Messaging (`pairKey`)**: Database `@unique` constraint on sorted participant IDs (`[idA, idB].sort().join('_')`).
- **AppArmor Linux Profiles**: Active profiles for Database, Nginx Gateway, and pgAdmin (`modellink-restrict-db`, `modellink-restrict-nginx`, `modellink-restrict-pgadmin`).
- **Structured Pino Log Rotation**: `pino` + `pino-roll` daily log rotation in `/logs/`.
- **Non-Root Container Security**: Docker container drops privileges via `su-exec modelLink` to UID `1001`.
- **Dynamic XML Sitemap**: `GET /sitemap.xml` streaming live PostgreSQL published models.
- **Integration Test Battery**: 16 Mocha/Chai/Supertest integration test files in `test/`.

### 🔄 Dual-Mode Implementation (Real + Demo)

- **Stripe Integration & Portfolio Demo Bypass**:
  - _Real Mode_: Stripe Connect Express onboarding (`POST /api/stripe/connect/onboard`), Stripe Elements `PaymentIntent` (`GET /api/orders/:id/payment-client-secret`), webhook listener (`POST /api/orders/stripe-webhook`).
  - _Portfolio Demo Mode_: One-click instant checkout (`POST /api/orders/:id/demo-checkout`). Both invoke identical atomic `fulfillOrder()` code.

### ⚠️ Intentionally Disabled / Not Used

- **HTTP-Only Cookie Storage for JWT**: `res.cookie('jwt', token)` is commented out in `auth.controller.js` in favor of pure Bearer headers for multi-platform client compatibility.
