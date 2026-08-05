# 🚀 ModelLink Backend Service Engine

> **Staff-Level Software Engineering Portfolio Project**
>
> Architected, implemented, and maintained by **Ahmed Manakhly** ([manakhly.tech](https://manakhly.tech) | [GitHub Profile](https://github.com/Ahmed-Manakhly))
>
> 🌐 **Live Demo Application**: [https://www.modellink.manakhly.tech/](https://www.modellink.manakhly.tech/)

---

## 📖 Production Documentation Framework

The backend service contains complete, empirical system documentation organized inside the [`docs/`](./docs) directory:

| Document File                                                                                | Architecture Scope                                                                                                 |
| :------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| 📄 **[00_STAFF_LEVEL_ARCHITECTURE_GUIDE.md](./docs/00_STAFF_LEVEL_ARCHITECTURE_GUIDE.md)**   | Consolidated staff-level architecture guide, production domain mapping, and discrepancy audit index.               |
| 📄 **[01_PROJECT_OVERVIEW.md](./docs/01_PROJECT_OVERVIEW.md)**                               | High-level system overview, core architectural features, verified technologies, and live demo boundaries.          |
| 📄 **[02_PORTFOLIO_CASE_STUDY.md](./docs/02_PORTFOLIO_CASE_STUDY.md)**                       | Technical case study highlighting Stripe Connect integration challenges and sandboxed containment.                 |
| 📄 **[03_HIGH_LEVEL_DESIGN_HLD.md](./docs/03_HIGH_LEVEL_DESIGN_HLD.md)**                     | Component topologies, data flow layouts, authentication, and Socket.io messaging sequence charts.                  |
| 📄 **[04_DATABASE_DESIGN_AND_LEDGER.md](./docs/04_DATABASE_DESIGN_AND_LEDGER.md)**           | Relational database schema structures, entity relationship indices, and append-only ledger transaction math.       |
| 📄 **[05_FEATURE_DEEP_DIVES_AND_LLD.md](./docs/05_FEATURE_DEEP_DIVES_AND_LLD.md)**           | Detailed designs: Stripe Webhooks, Socket.io per-user room structures, and time-limited asset delivery signatures. |
| 📄 **[06_SECURITY_LOGGING_AND_APPARMOR.md](./docs/06_SECURITY_LOGGING_AND_APPARMOR.md)**     | Host-level AppArmor security profile sources, brute-force lockout rules, and Pino logger rotations.                |
| 📄 **[07_DEVOPS_CONTAINERS_AND_CICD.md](./docs/07_DEVOPS_CONTAINERS_AND_CICD.md)**           | Multi-container Docker Compose setup, host-level Nginx gateway configuration, and GitHub Actions CD pipeline.      |
| 📄 **[08_ENVIRONMENT_SEEDING_AND_TESTING.md](./docs/08_ENVIRONMENT_SEEDING_AND_TESTING.md)** | Three-environment variables matrix, two-file seeding bot engine, and 16 integration tests specification.           |
| 📄 **[09_ENVIRONMENT_OPERATIONS_RUNBOOK.md](./docs/09_ENVIRONMENT_OPERATIONS_RUNBOOK.md)**   | Practical runbook for local Stripe forwarding, database cleaners index, and Postman collection setups.             |

---

## ⚡ Quickstart Backend Commands

```bash
# 1. Install server dependencies
npm install

# 2. Run initial database migration setup
npx prisma db push

# 3. Populate database with initial mock seed profiles
node seeding_scripts/run_all.js

# 4. Start local development server
npm start
```

---

## 📜 License & Copyright Attribution

Distributed under the **MIT License**. Copyright (c) 2026 **Ahmed Manakhly** ([manakhly.tech](https://manakhly.tech) \| [GitHub Profile](https://github.com/Ahmed-Manakhly)). See [LICENSE](LICENSE) for full details.
