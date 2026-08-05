# 02b — Product Requirements & Spark (FRs & NFRs)

> **Repository**: [`modelLink_server`](../README.md)  
> **Phase**: Conception & Pre-Architecture (Generates the HLD)

This document serves as the foundational **"Spark"** (Product Requirements Document) that dictates the Functional Requirements (FRs) and Non-Functional Requirements (NFRs) for the ModelLink platform. It precedes the High-Level Design (HLD) and dictates the exact User Journeys implemented in the database and seeding engines.

---

## 1. Project Context & Vision

This is a legacy project being upgraded and added to a senior software engineering portfolio.

It is an **AI Developers Marketplace Platform**, conceptually similar to Fiverr, but heavily specialized for AI developers and AI models.

- **Developers** can publish and sell their AI models.
- **Clients** can explore the catalog, place orders, communicate with developers, and receive the final delivery (Docker image, repository access, deployment link, API credentials, or any other agreed delivery method).

**The platform must support:**

- Marketplace browsing and discovery.
- Orders and contracts lifecycle.
- Real-time chat and communication between clients and developers.
- Reviews and ratings systems.
- Secure Stripe payment integration.
- Delivery management.
- Strict user roles and permissions (Client, Developer, Admin).
- Advanced business workflows similar to Fiverr.

---

## 2. User Journeys (The Flows)

These foundational flows dictate the exact state machines used in the API and Seeding Bots.

### 2.1 The Developer Journey

1. **Admin Setup**: System boots with taxonomy/categories and Admin user seeded.
2. **Registration**: Developer creates an account.
3. **Profile Completion**: Developer fills out bio and financial payout details.
4. **Verification (KYC)**: Developer submits identity documents.
5. **Admin Approval**: Admin reviews and approves the verification.
6. **Publishing**: Verified developer uploads model data, configuration, and sales pages.

### 2.2 The Client Journey

1. **Registration**: Client creates an account.
2. **Profile Completion**: Client fills out basic profile.
3. **Discovery**: Client browses and filters published models.
4. **Checkout**: Client places an order and pays via Stripe.
5. **Fulfillment**: Developer confirms and delivers the final asset.
6. **Feedback**: Client accepts delivery and leaves a public review.

---

## 3. Core Business Policies (Constraints)

- **Order Velocity**: The same client can order the same model multiple times (no limits).
- **Review Velocity**: The same client can only review a specific model **once** (to prevent rating manipulation).
- **Visibility**: Only models with a `PUBLISHED` status can be fetched by the public marketplace discovery APIs.

---

## 4. Product Ideas & Refinements

- **Expanded Taxonomy (Beyond Medical)**:
  - The platform is no longer strictly Medical-specific.
  - **Dynamic UI Fields**: Fields like _Modality_, _Body Part_, and _FDA Approval_ should only be visible when a model is categorized under "Medical Imaging".
  - For NLP, Computer Vision (CV), or Generative AI listings, those medical-specific fields must be hidden from both the creation forms and the public UI.
- **Re-branding**: Ensure the UI/UX reflects a modern, generalized AI marketplace.

---

## 5. Functional & Non-Functional Features (FRs & NFRs)

### Functional Requirements (FRs)

- **Real-Time Engine**: WebSockets (Socket.io) for live notifications and isolated chat rooms.
- **Taxonomy Engine**: Parent/Child category hierarchical relationships for the UI.
- **Filtration Engine**: Feature-rich search with auto-complete/on-typing functionality.
- **Dashboards**: Dedicated, paginated dashboards for Clients, Developers, and Admins.

### Non-Functional Requirements (NFRs)

- **Seeding Reliability**: A comprehensive seeding system must physically simulate the reliability of the user journeys and each workflow step-by-step.
- **Unified Architecture**: Consistent Backend/Frontend patterns for `ApiFeatures` (filtering/sorting/pagination) and `uploadingFiles`.
- **Database to UI UX**: Seamless, reactive state mapping from the PostgreSQL schema all the way to the React UI journey.
