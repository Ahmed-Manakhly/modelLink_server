# ModelLink Server

REST API and WebSocket backend for **ModelLink** — a two-sided marketplace where AI model developers publish models and healthcare clients browse, purchase, and review them.

## Stack

- Node.js + Express
- PostgreSQL + Prisma (`prisma db push` for schema sync)
- Socket.IO for realtime chat and notifications
- Stripe (optional in demo mode)

## Quick start

```bash
cp .env.example .env   # edit secrets; set MARKETPLACE_DEMO=true for local demo
npm install
./start-db-only.dev.sh # Docker Postgres + PgAdmin
npm start              # http://localhost:8000
```

Bootstrap creates an admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` on first run.

## Portfolio demo mode

Set `MARKETPLACE_DEMO=true` in `.env` to run without real Stripe charges. Mock checkout and Connect onboarding are used for reviewers.

Pair with the client repo: set `REACT_APP_MARKETPLACE_DEMO=true` there as well.

## Tests

Server must be running on port 8000:

```bash
npm test   # 121 integration tests (Mocha + Supertest)
```

## Key routes

| Area | Base path |
|------|-----------|
| Auth / users | `/users` |
| Models | `/aiModels` |
| Orders | `/orders` |
| Reviews | `/reviews` |
| Wallet / payouts | `/wallet`, `/stripeConnect` |
| Admin | `/admin` |

See `../modelLink_planning/reference/ModelLink.postman_collection.json` for the full API collection.

## Environment

Copy `.env.example` → `.env`. Never commit `.env`.

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `MARKETPLACE_DEMO` | Skip real Stripe in development |
| `STRIPE` | Stripe secret key (production) |
| `JWT_SECRET` / `ACCESS_SECRET_STR` | Auth tokens |
| `ENCRYPTION_KEY` | 32-char key for sensitive fields |

## Related repos

- **Client:** `modelLink_client` — React SPA
- **Planning:** private repo with sprint history and pre-push gate (`pre-push/`)

## License

MIT — see [LICENSE](LICENSE).
