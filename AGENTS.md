# AGENTS.md

Architecture notes and decision history for RokidsPass — a ClassPass-style
subscription platform for children's extracurricular activities in
Leicester. Stack: Node + Express + TypeScript, Prisma ORM, PostgreSQL.

This file is meant to be read start-to-finish as project history. Keep new
entries short (a few bullets) — don't let it grow unbounded.

## Development Log

### 2026-07-22 — Step 1: Database and Core Server Bootstrap

**Built:**
- Express + TypeScript server bootstrap: `src/server.ts` (entrypoint, graceful
  shutdown on SIGINT/SIGTERM) and `src/app.ts` (Express app factory with
  helmet, cors, json body parsing, morgan logging).
- Env config at `src/config/env.ts` — validated at startup with `zod`; the
  process exits immediately with a clear message if required vars are
  missing/invalid, rather than failing later at first use.
- Global error handling: `src/middleware/errorHandler.ts` exports an
  `AppError` class (statusCode + isOperational) for expected/operational
  errors, plus `notFoundHandler` (404) and `errorHandler` (catch-all, last
  middleware in the chain). Stack traces are only included in JSON responses
  when `NODE_ENV=development`.
- Prisma ORM wired to PostgreSQL: `prisma/schema.prisma` (placeholder
  `HealthCheck` model — replace once the real domain schema is designed),
  `src/lib/prisma.ts` (singleton client, cached on `global` in non-production
  to survive dev hot-reloads without exhausting connections).
- Health routes: `GET /health` (liveness only) and `GET /health/db` (runs
  `SELECT 1` through Prisma to confirm the DB connection is live).

**Conventions/decisions for future steps:**
- **Prisma pinned to 6.19.3** (not the newer 7.x that's currently on npm).
  Prisma 7 removed `datasource { url = env(...) }` from `schema.prisma` in
  favor of driver adapters configured in `prisma.config.ts` — a bigger
  migration than this step warranted. Stick to 6.x conventions (plain
  `DATABASE_URL` in `.env`, url in the datasource block) until there's a
  deliberate decision to upgrade.
- **`tsx` for the dev script, not `ts-node`/`ts-node-dev`.** The installed
  TypeScript is 7.0.2 (native compiler rewrite); `ts-node`'s internals
  (`ts.sys`) aren't compatible with it yet and crash on startup. `tsx`
  (esbuild-based) sidesteps this. `npm run build` still uses real `tsc` for
  full type-checking; `tsx` is transpile-only for local dev speed.
- Errors meant to reach the client as a specific status code should throw
  `AppError` (from `src/middleware/errorHandler.ts`) rather than a plain
  `Error` — anything else surfaces as a generic 500.
- `prisma generate` runs automatically on `npm install` via a `postinstall`
  script — no need to remember to run it by hand after a fresh clone.
- Local Postgres for dev was installed via `brew install postgresql@16`
  (already running as a brew service) and a `rokidspass` DB created. Connect
  with `psql rokidspass`; `DATABASE_URL` in `.env` already points at it.
- `npm run dev` starts the server, `npm run build && npm start` runs the
  compiled output, `npm run prisma:migrate` runs `prisma migrate dev`.

**Flag for whoever picks this up next:**
- No domain schema yet — `prisma/schema.prisma` only has a placeholder
  `HealthCheck` model to prove the migration/connection path works end to
  end. Step 2 should design the real models (users, venues, activities,
  subscriptions, bookings, etc.) and drop the placeholder.
- No auth yet, no request logging destination beyond stdout (morgan) —
  deliberately out of scope for this step.
- Verified end-to-end locally: `npm run build` type-checks clean, `prisma
  migrate dev` applied against the local Postgres instance, and both health
  endpoints (including the DB round-trip) responded correctly.

**Testing automation (added same day, in response to a follow-up ask):**
- Test runner is **Vitest**, not Jest — chosen because it doesn't shell out
  through `ts-node`/the TS compiler API the way Jest's ts-jest would, so it
  isn't affected by the TypeScript 7 incompatibility noted above.
  `tests/setup.ts` forces `NODE_ENV=test` before anything else loads (env
  vars are read at module-import time in `src/config/env.ts`, so this has to
  happen before the first import of that module).
- `tests/env.test.ts` and `tests/errorHandler.test.ts` are pure unit tests.
  `tests/health.test.ts` is a Supertest integration test that boots the real
  `createApp()` and hits `/health/db` for real — it needs a live Postgres to
  pass, both locally and in CI.
- `env.ts` now exports `envSchema` (previously private to the module) purely
  so tests can validate it without importing the module in a way that would
  trigger its `process.exit(1)` side effect on invalid env.
- `app.ts` skips morgan request logging when `NODE_ENV=test`, to keep test
  and CI output readable.
- Two layers run the suite automatically: a Husky **pre-push** git hook
  (`.husky/pre-push`, runs `npm test`) for fast local feedback, and a GitHub
  Actions workflow (`.github/workflows/test.yml`) that runs on every push to
  `main` and every PR, using a `postgres:16` service container. Pre-push was
  chosen over pre-commit so small in-progress commits aren't blocked, while
  nothing still reaches the remote untested.
- Commands: `npm test` (single run), `npm run test:watch` (watch mode during
  development).
