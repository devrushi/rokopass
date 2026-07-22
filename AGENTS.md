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

### 2026-07-22 — Step 2: Identity and Access Management

**Built:**
- `User` model + migration (`prisma/migrations/20260722015709_add_user_auth`)
  — email (unique), `passwordHash`, firstName/lastName, `role` enum
  (`PARENT` default, `ADMIN`). Replaces the Step 1 `HealthCheck` placeholder.
- Password hashing via `bcryptjs` (`src/lib/password.ts`, 12 salt rounds) —
  chosen over native `bcrypt` to avoid node-gyp/build-tool requirements.
- JWT access + refresh tokens (`src/lib/jwt.ts`) signed with **separate
  secrets** (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`, both required env,
  min 32 chars) so a leaked/misused token can't be replayed as the other
  type. Defaults: access 15m, refresh 30d, both configurable via env.
- `requireAuth` middleware (`src/middleware/requireAuth.ts`) reading
  `Authorization: Bearer <token>`; `src/types/express.d.ts` augments
  `Request.user` with the decoded payload (`sub`, `email`, `role`).
- Auth routes (`src/routes/auth.ts`, mounted at `/auth`): `POST /register`,
  `POST /login`, `POST /refresh` (issues a new access token from a valid
  refresh token), `GET /me` (protected, returns the current profile).
  Validation via zod schemas in `src/schemas/auth.ts` (password requires 8+
  chars, a letter, and a number). `serializeUser()` strips `passwordHash`
  from every response.
- Integration tests (`tests/auth.register.test.ts`, 7 cases) hit the real
  local Postgres like `health.test.ts` does — covers success, duplicate
  email (409), invalid email/weak password/missing field (400), that the
  stored hash isn't the plaintext password, and that the returned access
  token actually works against `/auth/me`. Cleans up its own rows via
  `afterAll` (emails suffixed `@test.rokidspass.local`).
- React frontend scaffolded in **`client/`** (Vite + React 19 + TypeScript +
  `react-router-dom`) — a plain, separate npm project sitting alongside the
  root API, not merged into a monorepo tool (no Nx/Turborepo). Root
  `package.json`/`tsconfig.json`/tests are untouched.
- `client/src/lib/tokenStorage.ts` (localStorage get/set/clear helpers) and
  `client/src/lib/apiClient.ts` (fetch wrapper: attaches the access token,
  and on a 401 auto-refreshes once via `/auth/refresh` and retries — with
  concurrent 401s deduped to a single in-flight refresh call).
- `client/src/context/AuthContext.tsx` — holds `user`/`login`/`register`/
  `logout`; on mount, if a token is already stored, calls `/auth/me` to
  restore the session.
- Responsive `Layout` + nav (`client/src/components/Layout.tsx`, hamburger
  menu under 640px) and `Login`/`Register`/`Dashboard` pages. `Dashboard`
  does its own `/auth/me` fetch (not just reading the cached context user)
  to show authoritative profile data, per the step's ask.

**Conventions/decisions for future steps:**
- **Refresh tokens are stateless JWTs — not stored or revocable
  server-side.** There's no `RefreshToken`/session table yet, so logout is
  client-side only (clears localStorage); a stolen refresh token stays
  valid until it naturally expires. Fine for now, but flag before this ships
  to real users — needs a DB-backed session store or blacklist.
- Added a minimal **Register page** in the UI even though the step's ask
  only listed a registration *API endpoint*. Without it, the requested
  dashboard (profile fetch) would have been unreachable from the browser —
  same reasoning as building Login. Kept both intentionally small (no
  validation beyond native HTML attributes + server-side errors surfaced
  as-is).
- CI (`.github/workflows/test.yml`) gained a second job, `client-build`,
  that type-checks and builds the frontend on every push/PR — no frontend
  *tests* exist yet, this is a build gate only. The Husky pre-push hook
  (`.husky/pre-push`) now also runs `npm --prefix client run build` for the
  same reason, locally.
- Frontend talks to the API via `VITE_API_URL` (`client/.env`, defaults to
  `http://localhost:3000`); backend `CORS_ORIGIN` is still `*` from Step 1,
  fine for local dev but should be locked to the real frontend origin
  before any deploy.

**Flag for whoever picks this up next:**
- No frontend test suite (React Testing Library, component tests, etc.) —
  only the build/type-check gate above. Manual verification for this step
  was done with a throwaway Playwright driver script (not committed):
  registered a user, landed on the dashboard with real fetched profile
  data, checked the mobile hamburger nav and dark mode, logged out and
  back in — zero console errors throughout.
- No password reset or email verification flow yet.
- `User.role` only has `PARENT`/`ADMIN` — no child/dependent profiles
  linked to a parent account yet, which the actual "children's activities"
  domain will need soon.
- Verified end-to-end: full backend suite is 24 tests green (`npm test`),
  both `npm run build` (root) and `client`'s build are clean, and the
  browser flow above passed with screenshots reviewed.

### 2026-07-22 — Step 3: Activity Management and Schedule Planning

**Built:**
- **Retroactively completed provider onboarding**, which Step 2 skipped:
  added `PROVIDER` to `UserRole` and a `verificationStatus`
  (`PENDING`/`APPROVED`/`REJECTED`, nullable — only meaningful for
  providers) field on `User`. `POST /auth/register` now accepts an
  optional `role` (`PARENT` default, or `PROVIDER` — never `ADMIN` via
  public registration), and sets `verificationStatus: PENDING` for new
  providers. This wasn't in this step's ask, but activities need an owner
  and the plan's Final Step assumes provider onboarding already exists —
  see the flag below.
- `AgeGroup` model, seeded via `prisma/seed.ts` (Toddlers/Preschool/
  Junior/Middle/Teen bands) — `prisma db seed` runs automatically after
  `npm run prisma:migrate`, and is a separate step in CI
  (`.github/workflows/test.yml`) since `migrate deploy` doesn't seed.
- `Activity` model (title, description, category as free-text — not an
  enum, since providers will keep inventing categories — location,
  capacity, creditCost, isActive, owned by a provider, references an
  `AgeGroup`). CRUD at `/activities`: public `GET /`, `GET /:id`; provider-
  only `POST /`, `PATCH /:id` (ownership-checked — a provider can only
  edit their own activities; `ADMIN` bypasses, for the Final Step); `GET
  /mine` for a provider's own list.
- `RecurringSchedule` (day-of-week + HH:mm start time + duration +
  WEEKLY/BIWEEKLY frequency + start/end date) and `ClassSession` (the
  materialized concrete occurrences) models, plus
  `src/services/scheduleGenerator.ts` — `generateOccurrences()` is a pure
  function (unit tested directly, `tests/scheduleGenerator.test.ts`) that
  turns a pattern into concrete start/end instants; `syncSessionsForSchedule()`
  wraps it in an upsert loop keyed on `(recurringScheduleId, startsAt)`.
  Sessions are materialized **56 days ahead** at creation time only — see
  flag below.
- API: `POST /activities/:id/schedules` (provider, generates sessions
  immediately), `GET /activities/:id/sessions?from=&to=` (public),
  `PATCH /sessions/:id` (provider, ownership-checked — edit time or toggle
  `isCancelled`).
- `requireRole(...roles)` middleware (`src/middleware/requireRole.ts`),
  reused alongside `requireAuth`.
- Frontend: `client/src/pages/provider/` — `ActivitiesList`, `ActivityForm`
  (create), `ActivityDetail` (activity info + "add a recurring schedule"
  form + a **weekly calendar grid** of sessions with Cancel/Restore per
  session, prev/next week navigation). `Register` now has a role picker
  (Parent/Provider) — needed so a provider account is reachable from the
  browser at all. Nav shows "My Activities" for `PROVIDER`/`ADMIN`.
  `ProtectedRoute` gained an optional `roles` prop for route-level
  authorization.

**Two real bugs caught during manual verification (both fixed, both now
covered by tests) — worth knowing about if you touch this code:**
- **Schedule generator silently dropped "today."** The window-start
  comparison used `pattern.startDate` and a bare-midnight cursor, so a
  class scheduled for later *today* was excluded because midnight-today is
  always earlier than the current moment. Fixed by comparing the actual
  `startsAt` instant (with the pattern's time-of-day applied) against
  `windowStart`/`windowEnd`, not a day-granularity cursor. Regression
  tests added in `tests/scheduleGenerator.test.ts`.
- **Calendar UI grouped sessions by the wrong day in UTC+ timezones.**
  `formatDayKey()` used `date.toISOString().slice(0, 10)` (UTC) while the
  visible day labels used `toLocaleDateString()` (local) — in BST
  (UTC+1), local midnight falls on the *previous* UTC calendar day, so
  every session rendered one column early. Fixed by deriving the key from
  local `getFullYear()`/`getMonth()`/`getDate()` instead. Caught only by
  actually driving the browser (curl/API tests looked fine since they
  don't render anything) — reinforces why the browser-verification step
  matters for anything date-rendering-related.

**Conventions/decisions for future steps:**
- **Sessions are materialized once, on schedule creation, for a 56-day
  rolling window — there's no recurring job extending that window.** A
  schedule created today has sessions through mid-September; nothing
  currently regenerates further out as time passes. Step 5 (booking) and
  beyond will need either a scheduled job (cron/worker) calling
  `syncSessionsForSchedule` per active schedule, or a lazy
  "extend-on-read" trigger. Not built yet — flagged, not solved.
- `syncSessionsForSchedule` **never overwrites an existing session** (`upsert`
  with `update: {}`) — a provider's manual edit or cancellation survives
  re-running the generator. Editing a `RecurringSchedule`'s pattern
  currently does *not* retroactively change already-materialized sessions;
  there's no `PATCH /schedules/:id` yet.
- Express 5's route-param types are `string | string[]` (path-to-regexp
  supports repeating params like `/:id+`, even though none of our routes
  use that). Added `src/lib/requestParams.ts`'s `param()` helper to narrow
  `req.params.x` to `string` everywhere rather than casting ad hoc — use it
  for any new route handler.
- Test files that create rows with foreign keys to each other **must use
  distinct email suffixes**, not a shared generic
  `@test.rokidspass.local`. Learned this the hard way:
  `auth.register.test.ts` and `activities.test.ts` both used the same
  suffix, and their `afterAll` cleanups raced — one tried deleting `User`
  rows the other's `Activity` rows still referenced, throwing a foreign
  key violation. Now `@register.test.rokidspass.local` and
  `@activities.test.rokidspass.local` respectively. Any new test file that
  creates related rows should follow the same pattern.

**Flag for whoever picks this up next:**
- The provider `verificationStatus` field does **nothing** yet — a
  `PENDING` provider can create activities and schedules exactly like an
  `APPROVED` one. The Final Step's admin approve/reject workflow needs to
  either gate activity creation on `APPROVED`, or gate activity
  *visibility* in public listings instead (probably the friendlier UX —
  providers can build their catalog while awaiting approval). Worth
  deciding explicitly rather than defaulting to whichever is easier.
- Category on `Activity` is a free-text field, not an enum/lookup table —
  fine for now, but search/filter (Final Step) will want to know the
  actual set of values in use before building a filter UI.
- No timezone handling — `startTime` is a plain `HH:mm` string interpreted
  in whatever timezone the Node process runs in. Fine while everything's
  Leicester-only and running in one region; would need real handling
  before supporting multiple venue timezones.
- Verified end-to-end: 43 backend tests green (`npm test`, including 4
  schedule-generator unit tests and 2 regression tests for the bugs
  above), both root and client builds clean, and the full provider flow
  (register as provider → create activity → add recurring schedule → see
  it on the calendar → cancel it) was driven in a real browser with
  screenshots reviewed and zero console errors.
