# 03 — High-Level Design (HLD) & System Topology

> **Repository**: [`modelLink_server`](../README.md)  
> **Scope**: System context, component architecture, request pipeline, authentication flow, payment settlement flow, real-time message transport, and containerized deployment architecture.

---

## 3.1 System Context Diagram

```mermaid
flowchart TD
    subgraph Clients["Client Layer"]
        Browser["React 18 SPA Browser Client"]
        Mobile["Mobile / External API Client"]
    end

    subgraph Proxy["Reverse Proxy Gateway"]
        Nginx["Nginx Reverse Proxy (Port 80/443)"]
    end

    subgraph Backend["ModelLink Server Node (Port 8000)"]
        Express["Express.js Modular Monolith"]
        SocketIO["Socket.io Real-Time Engine"]
    end

    subgraph DatabaseLayer["Data Layer"]
        PostgreSQL[("PostgreSQL Database Engine")]
    end

    subgraph External["External Integrations"]
        Stripe["Stripe API & Webhooks"]
        SMTP["SMTP Email Service (Nodemailer)"]
    end

    Browser -->|HTTP / REST| Nginx
    Browser -->|WebSocket WSS| Nginx
    Mobile -->|HTTP REST| Nginx

    Nginx -->|Proxy Pass /api| Express
    Nginx -->|Proxy Pass /socket.io| SocketIO

    Express -->|Prisma ORM| PostgreSQL
    SocketIO -->|Session & Chat Reads| PostgreSQL

    Express -->|Stripe Connect & Checkout| Stripe
    Stripe -->|Webhooks POST /api/orders/stripe-webhook| Express
    Express -->|Send OTP / Alerts| SMTP
```

---

## 3.2 High-Level Component Architecture

```mermaid
flowchart LR
    subgraph ExpressApp["Express Application Layer"]
        AppJS["app.js (Middleware Pipeline)"]

        subgraph Middleware["Global Middleware"]
            Helmet["Helmet (HTTP Headers)"]
            RateLimit["Express Rate Limit"]
            CORS["CORS Config"]
            AuthGuard["protect / restrictTo"]
        end

        subgraph Modules["Domain Modules"]
            AuthMod["Auth & User Module"]
            CatalogMod["Model Catalog & Versions"]
            OrderMod["Order & Settlement Module"]
            WalletMod["Wallet & Ledger Module"]
            ChatMod["Messaging & Socket Module"]
            DisputeMod["Dispute Arbitration Module"]
        end
    end

    AppJS --> Helmet
    Helmet --> RateLimit
    RateLimit --> CORS
    CORS --> AuthGuard
    AuthGuard --> Modules
```

---

## 3.3 Request-Response Execution Flow

```mermaid
sequenceDiagram
    autonumber
    actor Client as Client / Browser
    participant Nginx as Nginx Gateway
    participant RateLimiter as Rate Limiter
    participant Auth as Auth Middleware (protect)
    participant Controller as Express Controller
    participant Prisma as Prisma ORM
    participant DB as PostgreSQL DB

    Client->>Nginx: HTTP GET /api/aiModel/view/42
    Nginx->>RateLimiter: Pass Request
    RateLimiter->>Auth: Check Bearer Token (if protected)
    Auth->>Controller: Attach req.user & Execute
    Controller->>Prisma: prisma.aiModel.findUnique()
    Prisma->>DB: SQL Query
    DB-->>Prisma: Result Row
    Prisma-->>Controller: Model Domain Object
    Controller-->>Client: 200 OK JSON { status: "success", data: {...} }
```

---

## 3.4 Authentication & Token Verification Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Client
    participant AuthCtrl as auth.controller.js
    participant DB as PostgreSQL
    participant Mail as SMTP Service

    Note over User, Mail: Option A: Registration & OTP Verification
    User->>AuthCtrl: POST /api/auth/register
    AuthCtrl->>DB: Create User (isActive = false)
    AuthCtrl->>AuthCtrl: Generate 4-Digit OTP
    AuthCtrl->>Mail: Send OTP Email
    User->>AuthCtrl: POST /api/auth/verify-email (otp + email)
    AuthCtrl->>DB: Validates OTP via EmailToken table

    Note over User, Mail: Option B: Direct Bearer Token Authentication
    User->>AuthCtrl: POST /api/auth/login
    AuthCtrl->>DB: Verify bcrypt password hash
    AuthCtrl-->>User: 200 OK { token: "eyJhbGciOi...", user: {...} }
    Note over User: Future requests append header:<br/>Authorization: Bearer eyJhbGciOi...
```

---

## 3.5 Unified Order Fulfillment Sequence (`fulfillOrder`)

```mermaid
sequenceDiagram
    autonumber
    actor Client as Buyer / Client
    participant API as Express Order Router
    participant Stripe as Stripe API
    participant Core as fulfillOrder() Core Logic
    participant Prisma as Prisma $transaction
    participant DB as PostgreSQL DB

    alt Path 1: Production Stripe Elements + PaymentIntent
        Client->>API: POST /api/orders/create-payment-intent
        API->>Stripe: stripe.paymentIntents.create()
        Stripe-->>Client: clientSecret for Stripe Elements
        Client->>Stripe: Confirm payment via Stripe Elements
        Stripe->>API: Webhook: payment_intent.succeeded (POST /api/orders/stripe-webhook)
    else Path 2: Portfolio Demo Mode Bypass
        Client->>API: POST /api/orders/:id/demo-checkout
    end

    API->>Core: fulfillOrder(orderId, paymentId)
    Core->>Prisma: Execute $transaction atomic block
    Prisma->>DB: 1. Update Order status = 'PAID'
    Prisma->>DB: 2. Increment Wallet pendingBalance
    Prisma->>DB: 3. Create WalletTransaction (type: SALE)
    Prisma->>DB: 4. Create Notification for Developer
    DB-->>Core: Transaction Committed
    Core-->>Client: Order Fulfilled & Download Granted
```

---

## 3.6 Real-Time Socket.io Connection & Event Handling

```mermaid
sequenceDiagram
    autonumber
    actor UserA as Client User A
    actor UserB as Developer User B
    participant SocketServer as Socket.io Server (server.js — io object)
    participant DB as PostgreSQL DB

    UserA->>SocketServer: io.connect({ path: '/api/socket.io/', auth: { token: JWT_TOKEN } })
    SocketServer->>SocketServer: Authenticate JWT via handshake.auth.token
    UserA->>SocketServer: socket.emit('joinRoom', userId)
    SocketServer->>SocketServer: socket.join('{userId}__room')

    UserA->>SocketServer: socket.emit('msg_created', { forId, message })
    SocketServer->>UserB: io.to('{forId}__room').emit('receive_msg', messageData)
```

---

## 3.7 Containerized Deployment Architecture

```mermaid
flowchart TD
    subgraph Host["VPS Linux Host Server"]
        subgraph AppArmorLayer["AppArmor Kernel Security Profiles"]
            AA_DB["modellink-restrict-db"]
            AA_NGINX["modellink-restrict-nginx"]
            AA_PGADMIN["modellink-restrict-pgadmin"]
        end

        subgraph DockerCompose["Docker Compose Container Network"]
            NginxContainer["Nginx Container (Port 80/443)<br/>AppArmor: modellink-restrict-nginx"]
            BackendContainer["Backend Node Container (Port 8000)<br/>Non-Root User: modelLink (UID 1001)"]
            DBContainer["PostgreSQL Container (Port 5432)<br/>AppArmor: modellink-restrict-db"]
            PgAdminContainer["pgAdmin Container (Port 5050)<br/>AppArmor: modellink-restrict-pgadmin"]
        end
    end

    NginxContainer -->|proxy_pass| BackendContainer
    BackendContainer -->|pg connection| DBContainer
    PgAdminContainer -->|management| DBContainer

    AA_DB -.-> DBContainer
    AA_NGINX -.-> NginxContainer
    AA_PGADMIN -.-> PgAdminContainer
```
