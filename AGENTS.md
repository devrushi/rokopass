# AGENTS.md

Architecture notes and decision history for RokidsPass — a ClassPass-style
subscription platform for children's extracurricular activities in
Leicester. Stack: Node + Express + TypeScript, Prisma ORM, PostgreSQL,
Stripe, React (Vite) frontend.

This file is meant to be read start-to-finish as project history. Keep new
entries short (a few bullets) — don't let it grow unbounded.

## Project Status

RokidsPass connects **parents** booking extracurricular classes for their
children with **providers** who run those classes, with **admins**
moderating both. The initial build (Steps 1–6, all in this file's log
below) is complete end-to-end for that core loop:

- **Auth & roles** — JWT access/refresh tokens, three roles (`PARENT`,
  `PROVIDER`, `ADMIN`). Anyone can self-register as parent or provider;
  there's no public path to `ADMIN` — one is seeded by `prisma/seed.ts`
  (`admin@rokidspass.local`, dev-only credentials, see the Final Step
  entry).
- **Activities & scheduling** — providers create activities against a
  seeded set of age groups, attach recurring weekly/biweekly schedules,
  and a generator materializes concrete `ClassSession` rows on a rolling
  56-day window (not auto-extended — see Step 3's flag).
- **Subscriptions & credits** — Stripe Checkout (embedded) for monthly
  plans; credit balance is an append-only ledger (`CreditTransaction`),
  never a mutable counter, specifically so grants and deductions never
  race each other.
- **Booking & attendance** — booking a child into a session is one
  `SERIALIZABLE` Postgres transaction (capacity check + credit deduction
  together), retried on write-conflict. Bookings are a **request/approval
  flow, not instant**: a booking starts `PENDING_APPROVAL` with credits
  already held, and the provider must approve (→ `CONFIRMED`) or reject
  (→ `REJECTED`, credits refunded) before it's a confirmed spot. Providers
  get both a per-session roster and a dashboard (`/provider`) aggregating
  every pending booking across all their activities in one place, and can
  mark attendance once confirmed.
- **Moderation** — providers start `PENDING` and are invisible in public
  listings until an admin approves them (activity creation itself isn't
  blocked, only public visibility); admins can flag (hide) or feature
  (sort-to-top) any activity; every moderation action writes an
  `AuditLog` row.
- **Activity media & contact** — providers upload activity/staff photos
  (local disk storage — see the flag on that below) and can set a
  WhatsApp number; parents see both plus a "Chat on WhatsApp" deep link
  (not a real WhatsApp Business API integration) on an activity's page.
- **Analytics** — all three roles get a stats section on their dashboard
  (`/dashboard`, `/provider`, `/admin`), computed live from existing
  schema data — no separate tracking/instrumentation. Parents see credit
  usage and per-child attendance; providers see attendance/capacity/
  approval-speed/repeat-booking rates; admins see platform-wide growth
  and moderation-throughput numbers.
- **Role-scoped navigation** — each role only sees its own "my stuff"
  routes (parents: Plans/Browse/Children/Bookings; providers: My
  Activities). Admin has no personal end-user routes at all — its nav is
  purely platform-wide oversight: Children, Parents, Bookings,
  Activities, Providers, Plans, each a searchable/filterable list.
- **Plans have an audience** — `Plan.audience` is `PARENT` (real
  Stripe-billed credit packs) or `PROVIDER` (informational business
  tiers, no billing yet — see the relevant log entry). Admin has full
  CRUD over both from `/admin/plans`.
- **Child safety data & provider trust signals** — children have an
  optional allergy/medical note, visible only to the provider running a
  session that child is booked into (roster + pending-approval lists),
  never in any public or cross-provider view. Providers can self-report a
  DBS certificate number/expiry (reviewed by admin, not a live registry
  check) and social media links (Instagram/Facebook/TikTok, shown on
  their public activity pages). Activities can be marked SEND-friendly
  (provider-declared, filterable in Browse). See the relevant log entry
  for the compliance caveats on each of these.

**Explicitly not done** — flagged in detail in the relevant log entries,
summarized here: no live Stripe verification was performed (all Stripe
code is tested via SDK mocks only, see Step 4); no background job extends
the 56-day session-generation window as time passes (Step 3); no real
email provider, `sendEmail()` just logs (Step 5); no plan
switching/cancellation UI (Step 4); no timezone handling beyond the
server's local zone (Step 3).

**Running it locally:** `npm run dev` (root) and `npm run dev` (in
`client/`) for the two dev servers; `npm run prisma:migrate` to migrate +
seed (age groups, subscription plans, the dev admin user); `npm test` for
the backend suite. See `.env.example` / `client/.env.example` for required
environment variables.

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

### 2026-07-22 — Step 4: Subscription Plans and Credit Engine

**Built:**
- `Plan` (name, description, monthlyCredits, priceGbp in pence,
  `stripePriceId`), `Subscription` (one row per user — see decision below),
  `CreditTransaction` (append-only ledger: `amount` + `reason` enum
  `SUBSCRIPTION_INITIAL`/`SUBSCRIPTION_RENEWAL`/`BOOKING`/
  `BOOKING_REFUND`/`ADMIN_ADJUSTMENT`), and `StripeEvent` (processed
  webhook event IDs, for idempotency) models. `User` gained
  `stripeCustomerId`.
- `src/services/creditBalance.ts` — a user's balance is `SUM(amount)` over
  their `CreditTransaction` rows, computed on read, not a mutable counter.
  `getCreditSummary()` also returns their plan/status/renewal date.
- `src/lib/stripe.ts` — the Stripe SDK singleton (`stripe` package v22.3.2,
  pinned by whatever `npm install stripe` resolved on 2026-07-22 — this is
  a very new major version with real API-shape differences from older
  Stripe docs/tutorials, see below).
- `POST /billing/checkout-session` (auth required, any role) — creates a
  Stripe Customer on first use (cached on `User.stripeCustomerId`
  thereafter) and a subscription-mode Checkout Session with
  `ui_mode: "embedded_page"`, returning `clientSecret` for the frontend to
  mount. `GET /billing/checkout-session/:id/status` backs the post-checkout
  return page. `GET /billing/plans` (public), `GET /billing/credits`
  (auth).
- `POST /webhooks/stripe` (`src/routes/webhooks.ts`) — verifies the
  `Stripe-Signature`, checks `StripeEvent` for the event ID before doing
  anything (skips duplicates), dispatches to
  `src/services/subscriptionSync.ts`, then records the event ID.
  Handles `checkout.session.completed` (links the subscription, grants
  `plan.monthlyCredits` as `SUBSCRIPTION_INITIAL`),
  `invoice.paid` (grants `SUBSCRIPTION_RENEWAL` credits, **but only** when
  `billing_reason === "subscription_cycle"` — the *first* invoice has
  `billing_reason: "subscription_create"` and is intentionally skipped
  here since `checkout.session.completed` already granted those credits;
  granting on both would double-credit every new subscriber), and
  `customer.subscription.updated`/`.deleted` (status/period sync).
- Frontend: `Plans` page (public plan list, "Subscribe" → navigates to
  `/billing/checkout/:planId`), `Checkout` page (mounts Stripe's
  `EmbeddedCheckoutProvider`/`EmbeddedCheckout` using a `fetchClientSecret`
  callback against the endpoint above), `BillingReturn` page (the
  `return_url` target — confirms the session status and links to the
  dashboard). Dashboard now shows the credit balance/plan/renewal date, or
  a "View plans" prompt if unsubscribed. `.button`/`.form__error` styles
  moved from `provider.css` into `index.css` since they're generic, not
  provider-specific — reuse those classes rather than redefining button
  styles per page.
- `prisma/seed.ts` now also seeds three `Plan` rows (Starter/Family/
  Unlimited). In real dev, it creates matching Stripe Products/Prices via
  the API (idempotent via a `lookup_key`, safe to re-run). In `NODE_ENV=test`
  it skips the network call entirely and fabricates a fake price ID — see
  decision below.

**This SDK version's API shape differs from most Stripe tutorials/docs
you'll find — three drifts that cost real debugging time, worth knowing
before touching this code:**
- `ui_mode` for embedded Checkout is `"embedded_page"`, not `"embedded"`.
  (`"embedded"` isn't a valid value in this API version — the type is
  `'elements' | 'embedded_page' | 'form' | 'hosted_page'`.)
- `Subscription.current_period_end` **does not exist** at the top level
  anymore — it moved to each `SubscriptionItem`
  (`subscription.items.data[0].current_period_end`). See `periodEndOf()`
  in `subscriptionSync.ts`.
- `Invoice.subscription` **does not exist** at the top level either — the
  subscription ID is under `invoice.parent.subscription_details.subscription`.
  Same for `Invoice.subscription` generally; Stripe restructured invoices
  around a `parent` object for what generated them.
  **Before assuming any Stripe field/type from memory or an older
  tutorial, grep the actual installed `.d.ts` files in
  `node_modules/stripe/cjs/resources/` first** — this API has moved fast.

**Conventions/decisions for future steps:**
- **`Subscription` is one row per user, mutated in place — not versioned
  per Stripe subscription.** Switching plans updates the existing row;
  there's no history of past subscriptions beyond "current state." Fine
  for a single-active-plan-per-user product; revisit if RokidsPass ever
  needs subscription history/audit beyond the credit ledger itself.
- **Credits are a ledger, not a counter**, specifically so Step 5's
  booking-time deduction can insert a `CreditTransaction` (`reason:
  "BOOKING"`, negative `amount`) without racing a concurrent renewal
  grant — both are just inserts, no read-modify-write. Step 5 should
  follow this pattern (insert a transaction, don't decrement a field) and
  will want a DB-level check (e.g. a constraint or a transaction that
  verifies balance ≥ cost before inserting) to prevent overdraft under
  concurrency — not built yet, that's Step 5's "concurrency checks" ask.
- **CI/test never calls the real Stripe API.** `STRIPE_SECRET_KEY` in CI
  is a placeholder string; `prisma/seed.ts` checks `NODE_ENV` and skips
  live Product/Price creation in test; and all route/webhook tests mock
  `../lib/stripe` via `vi.mock` + `vi.hoisted()` rather than hitting the
  network. Follow this pattern for any new Stripe-touching code — don't
  make CI depend on live Stripe credentials.
- The webhook route is mounted with `express.raw({ type: "application/json" })`
  **before** the global `express.json()` in `app.ts` — signature
  verification needs the exact raw bytes. If you add more webhook-style
  routes (raw body required), mount them the same way, before the global
  JSON parser, not after.

**Flag for whoever picks this up next:**
- **Not verified against live Stripe.** I set up Stripe CLI (`~/bin/stripe`,
  installed via direct GitHub release since Homebrew's bottle wanted a
  newer Xcode than what's installed) and started a `stripe login` flow,
  but the user opted to skip completing it for this session. Everything
  above is verified via mocked unit/integration tests (module-level Stripe
  SDK mocks) and clean type-checks/builds only — **no real checkout
  session, webhook delivery, or Stripe CLI `trigger` has actually been
  exercised.** Before shipping this, run `stripe login`, `stripe listen
  --forward-to localhost:3000/webhooks/stripe` to get a real
  `STRIPE_WEBHOOK_SECRET`, and `stripe trigger checkout.session.completed`
  (plus a real embedded-checkout run in the browser) to confirm the whole
  path actually works end-to-end, not just its unit-tested parts.
- Real Stripe test-mode keys still need to go in `.env`
  (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) and `client/.env`
  (`VITE_STRIPE_PUBLISHABLE_KEY`) — currently placeholder values that will
  make any real Stripe API call fail.
- No plan-switching or cancellation UI — a user can subscribe but can't
  currently downgrade/upgrade/cancel from the app (would need a Stripe
  Billing Portal session or custom UI calling `stripe.subscriptions.update`/
  `.cancel`).
- No refund handling beyond the `BOOKING_REFUND` ledger reason existing as
  an enum value — nothing creates that transaction yet; that's Step 5's
  concern when a booking is cancelled.
- Verified: 59 backend tests green (`npm test` — 12 new tests across
  `creditBalance.test.ts`, `webhooks.test.ts`, `billing.test.ts`, all
  using mocked Stripe calls), both root and client builds clean.

### 2026-07-22 — Step 5: Class Booking and Attendance Roster

**Built:**
- `Child` model (parent-owned) and `Booking` model
  (`CONFIRMED`/`CANCELLED`/`ATTENDED`/`NO_SHOW`), since bookings need both
  a child and a per-session capacity/credit check that didn't exist before
  — another retroactive gap-fill like Step 3's provider role.
- `src/services/booking.ts` — `createBooking()` runs the capacity check,
  credit-balance check, booking insert, and credit deduction (a
  `CreditTransaction` with `reason: "BOOKING"`) inside one
  **`Prisma.TransactionIsolationLevel.Serializable`** transaction, retried
  up to 3 times on Postgres write-conflict (`P2034`) before returning 409.
  This is the "concurrency checks" ask — verified with a real test that
  fires two simultaneous booking requests at a capacity-1 session and
  asserts exactly one wins (`tests/bookings.test.ts`), not mocked.
  `cancelBooking()` refunds via a `BOOKING_REFUND` transaction, closing the
  loop flagged in Step 4.
- `src/lib/email.ts` — a `sendEmail()` seam with a console-log transport
  (no real provider configured); `createBooking` calls it after the
  transaction commits, not inside it, so a notification failure can't roll
  back a paid-for booking.
- `GET /sessions/:id/attendees` (provider, ownership-checked) and
  `PATCH /bookings/:id/status` (provider marks `ATTENDED`/`NO_SHOW`).
- Frontend: `Children` (add/list), `Browse` + `ActivityBrowseDetail`
  (parent-facing activity list, session list, child picker, Book button,
  inline confirmation), `MyBookings` (list + cancel), and `Roster`
  (provider view of a session's bookings with attendance buttons). Nav
  gained Browse/My Children/My Bookings for parents.

**Conventions/decisions for future steps:**
- SERIALIZABLE + bounded retry is now the established pattern for
  "check-then-write under contention" — reuse it (don't invent a new
  locking strategy) for anything else with the same shape.
- `POST /bookings` returns the booking **with `child`/`session.activity`
  included**, not the bare row `createBooking()` returns internally — the
  route re-fetches with includes before responding, specifically so the
  frontend confirmation UI doesn't need a second round-trip. If you add
  another booking-adjacent endpoint, follow that shape rather than
  returning the raw transaction result.

**Flag for whoever picks this up next:**
- No real email provider — `sendEmail()` just logs. Fine for now; swap
  the implementation in `src/lib/email.ts` when one's chosen, every caller
  already goes through that one function.
- Step 3's flag still applies and now matters more: `ClassSession` rows
  are only materialized 56 days ahead **at schedule-creation time**, with
  nothing extending that window as time passes. A long-lived recurring
  schedule will eventually run out of bookable sessions with no automatic
  refresh — needs a scheduled job.
- No admin-facing view across all providers' bookings/rosters — that's
  the Final Step's territory (admin dashboard, moderation).
- Debugging note, not a product gap: while browser-verifying this step, a
  Playwright script simulating two users (provider + parent) in the same
  browser context produced confusing 403s — two pages in one context
  **share `localStorage`**, so the second login's tokens clobbered the
  first's. Fixed by using two separate `browser.newContext()` calls. Not
  an app bug, but worth knowing if you script multi-user browser
  verification again.
- Verified: 71 backend tests green (12 new in `tests/bookings.test.ts`,
  including the real-concurrency test), both builds clean, and the full
  flow — provider creates activity/schedule → parent registers, adds a
  child, gets test credits, browses, books, sees confirmation → provider
  views the roster and marks attendance → parent sees the updated status
  — was driven in a real browser across two isolated sessions with zero
  console errors (aside from an expected 401→refresh→200 sequence when an
  access token genuinely expired mid-test, which self-recovered exactly
  as designed).

### 2026-07-22 — Final Step: Admin Moderation and Verification Portal

**Built:**
- `AuditLog` model (`adminId`, `action` enum, `targetType`/`targetId`,
  optional JSON `metadata`) — every moderation action below writes one row.
  `Activity` gained `isFlagged`/`isFeatured` booleans.
- `src/routes/admin.ts`, mounted at `/admin` with router-level
  `requireAuth` + `requireRole("ADMIN")` (no route-by-route repetition):
  `GET /providers?status=` (default `PENDING`), `POST /providers/:id/approve`,
  `POST /providers/:id/reject` (optional `reason`, stored in the audit
  log's `metadata`), `GET /activities` (search/category/ageGroup/provider/
  flagged/featured filters + pagination — this is the "search and filter"
  ask, and deliberately unrestricted by approval status since admins need
  to see everything, unlike the public listing), `PATCH
  /activities/:id/moderation` (`isFlagged`/`isFeatured`), and
  `GET /audit-log` (filterable by target) — built so the audit trail is
  actually readable, not just written.
- **Closed Step 3's flag**: `GET /activities` (public) now filters to
  `isActive && !isFlagged && provider.verificationStatus === APPROVED`
  (or the provider is an `ADMIN`, who has no verification status to
  check), and orders featured activities first. This only hides
  activities from the public listing — creation, editing, and a
  provider's own `GET /activities/mine` are unaffected, so a `PENDING`
  provider can still build their catalog while awaiting approval (the
  option Step 3 called "friendlier UX").
- `prisma/seed.ts` now also seeds a dev **admin bootstrap account**
  (`admin@rokidspass.local` / `AdminPassword123`) — there is no public
  registration path to `ADMIN` by design, so this is the only way to get
  one locally. Seeding order changed so this (and age groups) still runs
  even if the Stripe-dependent plan seeding fails (see below).
- Frontend: `PendingProviders` (approve/reject queue, optional rejection
  reason) and `ActivityModeration` (search/filter form, flag/feature
  toggles, a live "recent admin actions" panel reading `GET /audit-log`)
  under `/admin/providers` and `/admin/activities`. Nav shows both for
  `ADMIN` only.

**Conventions/decisions for future steps:**
- Router-level `adminRouter.use(requireAuth, requireRole("ADMIN"))` is the
  pattern for "every route in this file needs the same gate" — cleaner
  than repeating both middlewares on each handler. Use it for any future
  role-scoped router.
- `prisma/seed.ts`'s step ordering matters: Stripe-dependent seeding
  (`seedPlans`) now runs **last**, after `seedAgeGroups`/`seedAdmin`, so a
  missing/invalid `STRIPE_SECRET_KEY` (true in this session — see Step 4)
  doesn't prevent the rest of the seed from completing. Keep any future
  external-network seed step last for the same reason.
- Visibility gating (public listing) vs. access gating (creation/editing)
  are deliberately different mechanisms here — don't conflate "a provider
  can use the feature" with "the public can see the result." Future admin
  features (e.g. banning a provider outright) should decide explicitly
  which one they mean, the way this step had to.

**Flag for whoever picks this up next:**
- The seeded admin password is a plaintext dev convenience committed to
  the repo (in `prisma/seed.ts`, not `.env`) — fine for local/throwaway
  environments, **must not** be how the first real admin account gets
  created before any actual deployment.
- Gating is applied only to the public **listing** endpoint
  (`GET /activities`), not the by-ID detail/sessions endpoints — a
  pending or flagged activity is unlisted but still reachable by anyone
  who has (or guesses) its direct URL. Chosen to avoid needing an
  optional-auth middleware (providers' own management pages fetch by ID
  without a token) and because none of this step's asks required
  detail-page-level enforcement. Flag if stronger enforcement is needed
  later — it would need an `optionalAuth` middleware plus an ownership
  check on the by-ID routes.
- No provider suspension/ban after approval — once `APPROVED`, always
  approved (their activities can still be individually flagged, but the
  provider account itself has no path back to hidden).
- No pagination UI on the frontend — `GET /admin/activities` supports
  `page`/`limit` but `ActivityModeration.tsx` only ever requests the
  first page. Fine at current data volumes, worth adding pagination
  controls before this list grows large.
- This closes the loop the plan called out (provider onboarding from Step
  2/3, activity management from Step 3) — see **Project Status** at the
  top of this file for the end-to-end picture and the consolidated list
  of what's still explicitly out of scope across every step.
- Verified: 80 backend tests green (9 new in `tests/admin.test.ts`,
  covering authorization, the approve/reject/audit-log flow, and the
  flag/feature/search behavior including that admin search bypasses the
  public visibility gate), both builds clean, and the full flow —
  provider creates an activity while `PENDING` (confirmed invisible to a
  browsing parent) → admin approves the provider (confirmed now visible)
  → admin flags the activity (confirmed invisible again) → audit log
  shows both actions — was driven across three isolated real-browser
  sessions (admin/provider/parent) with zero console errors.

### 2026-07-22 — Provider Dashboard and Booking Approval Workflow

Post-launch enhancement, requested after the initial six steps closed:
a landing page for providers, and a real approval step before a booking
counts as confirmed (previously bookings were instant).

**Built:**
- **`BookingStatus` gained `PENDING_APPROVAL` (new default) and
  `REJECTED`.** `createBooking()` still does the capacity check + credit
  deduction in one `SERIALIZABLE` transaction exactly as before, but now
  creates the booking as `PENDING_APPROVAL` — credits are held at request
  time, not confirmation time, specifically so the concurrency-safe
  transaction shape from Step 5 didn't need to change. The capacity count
  now counts `PENDING_APPROVAL` + `CONFIRMED` together (a "holding" a
  slot), so a pile of unanswered requests can still fill a class.
- `approveBooking()`/`rejectBooking()` in `src/services/booking.ts` —
  approve is a pure status change; reject flips to `REJECTED` and issues a
  `BOOKING_REFUND` transaction (the same mechanism `cancelBooking` already
  used). Both send a decision email. `cancelBooking()` now accepts
  cancelling from either `PENDING_APPROVAL` or `CONFIRMED`.
- Routes: `POST /bookings/:id/approve`, `POST /bookings/:id/reject`
  (ownership-checked, `ADMIN` bypasses — this was missing from the first
  pass and had to be added to the service layer, not just the route, to
  match the ownership-check pattern used everywhere else in this codebase),
  and `GET /bookings/pending-approval` (aggregates pending bookings across
  *all* of a provider's activities — the query the dashboard needs and no
  existing endpoint could answer). `GET /sessions/:id/attendees` now
  includes `PENDING_APPROVAL` bookings so the per-session roster shows
  them too, with the same approve/reject actions as the dashboard.
- Frontend: `ProviderDashboard` (`/provider`) — pending-approval list with
  inline approve/reject, plus a compact activities summary. Signed-in
  providers now land here instead of the generic parent-oriented
  `/dashboard` (new `HomeRedirect` component reads the user's role and
  picks the destination for `/` and any unmatched route). `Roster.tsx`,
  `MyBookings.tsx`, and the booking confirmation copy in
  `ActivityBrowseDetail.tsx` all updated for the new pending state
  ("Booking requested!" instead of "Booking confirmed!", credits noted as
  "held" not spent outright).

**Conventions/decisions for future steps:**
- **Credits are deducted at request time, refunded on rejection** — not
  "deducted on approval." This was a deliberate choice to avoid touching
  the SERIALIZABLE booking transaction's shape (capacity + balance check
  + deduction all had to stay atomic together); approval/rejection are
  separate, simpler operations that don't need that isolation level
  themselves (no concurrent-write-skew risk in a single-row status flip).
- **Adding two enum values to a Postgres enum and using one as a column
  default cannot happen in the same migration/transaction** — Postgres
  requires new enum values to be committed first. Hit this directly:
  `ALTER TYPE ... ADD VALUE` + `ALTER COLUMN ... SET DEFAULT` in one
  `migration.sql` failed with `55P04 unsafe use of new value`. Fixed by
  splitting into two migrations (add values, then a separate migration to
  set the default). If a future step adds enum values *and* wants to use
  them immediately (as a default, in a backfill, etc.), split it the same
  way from the start rather than discovering the error at deploy time.
- Hardcoded post-login redirects (`navigate("/dashboard")` in `Login.tsx`
  and `Register.tsx`) don't compose with role-aware landing pages — had to
  change both to `navigate("/")` and let `HomeRedirect` decide. Any new
  auth-adjacent redirect should go through `"/"` for the same reason,
  rather than hardcoding a destination.

**Flag for whoever picks this up next:**
- List pages here (dashboard, roster, my-bookings) fetch once on mount and
  don't auto-refresh — a provider sitting on `/provider` won't see a new
  booking request appear without navigating away and back or reloading.
  This is consistent with every other list page in the app (not a new
  gap), but it's more noticeable here since approvals are time-sensitive.
  Worth polling or adding a manual refresh affordance before this feels
  production-ready.
- No notification (email or otherwise) tells a provider a new booking is
  waiting — they only find out by visiting the dashboard. Combined with
  the no-auto-refresh point above, a provider could plausibly miss pending
  requests for a while.
- Verified: 85 backend tests green (14 new: approve/reject success and
  ownership checks, refund-on-reject, `GET /bookings/pending-approval`
  scoping, the roster showing pending bookings, and that attendance can't
  be marked until approved), both builds clean. Full flow — provider
  registers and lands directly on `/provider` → admin approves the
  provider → provider creates an activity/schedule → parent books (sees
  "Booking requested!") → provider's dashboard shows it and approves it
  → parent sees `CONFIRMED` → a second booking gets rejected and the
  credit refund is verified directly against the ledger (balance math
  checked, not just eyeballed) → parent sees `REJECTED` — was driven
  across three isolated real-browser sessions with zero console errors.

### 2026-07-22 — Activity Media (Photos) and WhatsApp Contact

Two small post-launch feature requests, built together since both touch
the activity detail page.

**Built:**
- `ActivityMedia` model (`type`: `ACTIVITY_PHOTO`/`STAFF_PHOTO`, `url`,
  optional `caption`) and `User.whatsappNumber`.
- `src/lib/upload.ts` — file uploads go to **local disk** under
  `<project root>/uploads/activities/` (multer, 5MB limit, JPEG/PNG/WEBP
  only), served statically at `/uploads`. No object-storage provider
  (S3/Cloudinary/etc.) is configured — this is the seam to swap one in
  later, same pattern as `src/lib/email.ts`. `uploads/` is gitignored.
  **Real gotcha, not obvious in advance:** helmet's default
  `Cross-Origin-Resource-Policy: same-origin` silently blocks `<img>` tags
  loaded from a different origin (the frontend at :5173 loading images
  from the API at :3000 in dev) — the browser shows a blank broken image
  with no console error pointing at the cause. Fixed by relaxing that one
  header to `cross-origin`, only for the `/uploads` path, in `app.ts`.
- `POST /activities/:id/media` (multipart upload, ownership-checked) and
  `DELETE /activities/:id/media/:mediaId` (removes the DB row and the
  file from disk). `GET /activities`, `/mine`, and `/:id` all now include
  `media`; the single-activity route also includes
  `provider.whatsappNumber` for the chat button.
- `PATCH /auth/me` (new — previously `/auth/me` was read-only) lets a
  user set/clear `whatsappNumber`, validated as international format
  (`+` + 8-15 digits).
- Frontend: a "Photos" section on the provider's `ActivityDetail` page
  (upload form + delete-able grid, shown to the owning provider only) and
  a WhatsApp number field on `ProviderDashboard`. Parent-facing
  `ActivityBrowseDetail` shows an activity photo gallery, a "Meet the
  team" staff-photo section, and (if the provider set a number) a
  **"Chat on WhatsApp" button** — `apiClient.ts` gained `apiAssetUrl()`
  (builds absolute URLs for `<img src>`, since media URLs from the API are
  relative) and FormData support (skips JSON-stringifying/Content-Type
  when the body is a `FormData`, letting the browser set the multipart
  boundary itself).

**Conventions/decisions for future steps:**
- **The WhatsApp integration is a `wa.me` deep link, not the WhatsApp
  Business API.** A real API integration needs a Meta developer account
  and business verification — credentials this project doesn't have,
  same class of blocker Stripe was in Step 4. The deep-link pattern
  (`https://wa.me/<number>?text=<prefilled message>`) needs zero
  credentials and is how most small marketplace/booking platforms
  actually implement "message the provider" — it opens WhatsApp with a
  pre-filled message, it just isn't in-app chat. If real in-app
  messaging or delivery receipts are ever required, that's a genuinely
  different, much larger feature (webhook-based, needs the Business API),
  not an upgrade of this one.
- File uploads are validated by declared MIME type only (`fileFilter` on
  the client-reported `Content-Type`), not by sniffing actual file bytes.
  Adequate for a trusted-provider MVP; a hardening pass before handling
  untrusted/public uploads should verify actual file content, not just
  the declared type.

**Flag for whoever picks this up next:**
- Local disk storage means uploaded photos **do not survive a redeploy**
  on most hosting platforms (ephemeral filesystems) and won't work at all
  across multiple server instances. Fine for this dev/demo environment;
  needs a real object-storage provider before any real deployment — the
  seam is already there (`src/lib/upload.ts`), swapping it is scoped to
  one file plus the two routes that call `activityMediaUpload`/
  `activityMediaPublicUrl`.
- No image resizing/thumbnailing — the original uploaded file is served
  as-is at whatever resolution it was uploaded, which could be large.
- Verified: 98 backend tests green (13 new: 9 media upload/delete
  covering ownership, file-type/size rejection, and disk cleanup on
  delete — confirmed by actually checking the files on disk, not just the
  DB row; 4 for the WhatsApp number endpoint), both builds clean. Full
  flow — provider sets a WhatsApp number, creates an activity, uploads a
  real activity photo and a captioned staff photo → parent browses, sees
  both photos rendered (a real cross-origin image load, not mocked) and
  the WhatsApp button with the correct deep-link URL and prefilled
  message — was driven in a real browser with zero console errors.

### 2026-07-22 — Analytics Dashboards (Parent, Provider, Admin)

Post-launch feature: a stats section for all three roles, computed
entirely from existing schema data (no new event tracking/instrumentation
added — a deliberate choice over reaching for an AI/ML approach, since
every number here is a deterministic aggregate query, not a prediction;
see the note below on where AI would actually earn its keep).

**Built:**
- `src/services/analytics.ts` — three pure aggregation functions,
  `getParentAnalytics`/`getProviderAnalytics`/`getAdminAnalytics`, each a
  handful of parallel Prisma queries plus in-memory grouping (no raw SQL).
  Parent: balance, 30-day credit spend, spending by category, per-child
  attendance, upcoming bookings. Provider: attendance rate, average
  session-capacity utilization, average approve/reject response time,
  repeat-booking rate, top activities by bookings. Admin: user/signup
  counts, pending-provider queue depth, average provider-approval time,
  bookings by status, flagged/featured activity counts, top categories.
  All percentage/time-average fields are rounded to 1 decimal
  (`round1()`) before returning — the first browser pass caught raw
  floats like `1.8553666666666666` overflowing their stat tile into the
  neighboring one, not just looking untidy.
- `GET /analytics/parent`, `GET /analytics/provider` (new
  `src/routes/analytics.ts`, role-gated), and `GET /admin/analytics`
  (added to the existing admin router, already gated at `ADMIN`).
- Frontend: two new shared components, `StatTile`/`StatRow` and `BarList`
  (`client/src/components/analytics/`), following the `dataviz` skill's
  form rules — a stat tile for single numbers, a single-hue bar list for
  magnitude comparisons (top activities/categories), and the reserved
  good/warning/serious/critical status palette for booking-status
  breakdowns via a shared `bookingsByStatusToBarItems()` helper. Added to
  `Dashboard.tsx` (parent), `ProviderDashboard.tsx`, and a new
  `AdminDashboard.tsx` (new `/admin` route, added to `HomeRedirect` and
  the nav bar so admins land there instead of the generic dashboard).

**AI for analytics — considered, not used:** the request asked this
explicitly before building. Every metric here is a straight aggregate
(counts, rates, averages) with an exact right answer — AI would add
latency, cost, and a chance of a plausible-sounding wrong number for
things a `GROUP BY` already answers exactly. AI becomes worth it once the
ask moves from *reporting what happened* to *interpreting or predicting*
it — e.g. plain-English summaries of a provider's trends, anomaly/no-show
risk flagging, or a natural-language query box over the same data. None
of that was requested; noted here as the natural next step if it is.

**Verified:** 106 backend tests green (8 new, covering exact-value
assertions for parent/provider analytics via direct-Prisma fixtures and a
delta-based snapshot test for admin's platform-wide counts, plus role
gating). Both frontend and backend builds clean. All three dashboards
were driven in a real browser (tokens minted directly for the existing
admin/provider/parent accounts, one isolated browser context per role) —
zero console errors, real data rendered correctly, and the rounding bug
above was caught and fixed by this pass, not by eyeballing the code.

### 2026-07-22 — Dev Quick Login Buttons

Testing convenience: one-click login for each role on the login page,
requested to avoid re-typing credentials while manually testing.

**Built:**
- Two new seeded accounts in `prisma/seed.ts` — `seedDemoAccounts()`
  creates `demo.parent@rokidspass.local` / `DemoParent123` (`PARENT`) and
  `demo.provider@rokidspass.local` / `DemoProvider123` (`PROVIDER`,
  pre-set to `verificationStatus: APPROVED` so it's immediately visible
  to parents browsing, not stuck behind admin moderation). Runs in
  `main()` alongside `seedAdmin()`, before the Stripe-dependent
  `seedPlans()`, so it isn't affected by that step's placeholder-key
  failure (see the Final Step entry).
- Three buttons on `Login.tsx` — Parent / Activity Provider / Admin —
  each calling the normal `login()` with one of the seeded accounts'
  credentials, hardcoded in a `QUICK_LOGINS` array. Gated behind
  `import.meta.env.DEV`, so the whole section (buttons and credentials)
  is compiled out of a production build, not just hidden by CSS.
- No new backend endpoint — this reuses `POST /auth/login` exactly as
  the real form does, just with baked-in credentials, so it can't
  introduce an auth bypass distinct from "knowing a password."

**Verified:** seed re-run confirmed via direct DB query; full backend
suite still 106/106; frontend build clean. Each of the three buttons was
clicked in an isolated browser context and confirmed to land on the
correct role's dashboard (`/dashboard`, `/provider`, `/admin`) with zero
console errors.

### 2026-07-22 — Admin Platform Views, Provider vs Parent Plans, WhatsApp Fix

Three requests handled together: admin's nav had drifted into showing
parent/provider "my stuff" (Plans, Browse, My Children, My Bookings, My
Activities) via `roles={["...", "ADMIN"]}` on those routes — admin should
only see platform-wide oversight, not act as a customer. Separately, the
one shared `Plan` list didn't distinguish parent credit-packs from
anything provider-relevant. A WhatsApp-field robustness fix rode along.

**Built:**
- **Admin platform views** — three new list pages, `/admin/children`,
  `/admin/parents`, `/admin/bookings` (search + status filter for
  bookings), backed by new `GET /admin/children|parents|bookings`
  endpoints. Nav and `App.tsx` routes reworked so each role only sees its
  own routes: `roles={["ADMIN"]}` removed from every parent/provider
  route (`/plans`, `/browse`, `/children`, `/bookings`, `/provider/*`),
  and ADMIN's nav is now exclusively Children/Parents/Bookings/
  Activities/Providers/Plans — no personal end-user path exists for that
  role anymore, by route restriction, not just hidden nav links.
- **`Plan.audience`** (`PARENT`/`PROVIDER`, migration
  `20260722150000_add_plan_audience`) — `monthlyCredits` and
  `stripePriceId` are now nullable (only meaningful for `PARENT` plans),
  a new nullable `maxActiveActivities` is `PROVIDER`-only. Chose
  **informational business tiers over real billing** for providers after
  checking with the user first — Stripe isn't fully live in this project
  anyway (see Step 4), so a second billed subscription type would have
  been a lot of build for a demo. `GET /billing/plans` now filters to
  `audience: PARENT`; new `GET /billing/provider-plans` lists the
  provider tiers read-only (shown on `ProviderDashboard` under "Business
  tiers" — no self-serve upgrade flow, admin manages tier definitions).
  Checkout (`POST /billing/checkout-session`) now rejects non-PARENT or
  billing-less plans defensively. Full CRUD (`GET/POST/PATCH/DELETE
  /admin/plans`) on `/admin/plans`, filterable by audience, with delete
  blocked (409) if a `PARENT` plan still has subscriptions attached
  (Postgres FK restrict, caught and turned into a clear error rather than
  a raw 500).
  **Note found while re-seeding:** the local dev DB has no
  `_prisma_migrations` tracking table (schema was built via ad-hoc SQL/
  `db push` at some point, not `migrate deploy`), and the 3 parent credit
  plans seeded via raw SQL earlier this project (see the "what plans" log
  entry) were gone by this pass — re-inserted the same way. Whoever
  deploys this for real should baseline the migration history properly
  first (`prisma migrate resolve --applied` per existing migration, or a
  fresh `migrate deploy` against an empty database).
- **WhatsApp field fix** — `ProviderDashboard`'s number field only
  updated from a separate `refreshUser()` round-trip after saving, not
  from the save response itself. Couldn't reproduce actual staleness
  under either a fresh save or a reload of a pre-existing number, but
  closed the gap anyway: the field now sets directly from the `PATCH
  /auth/me` response before the (still-run, for the rest of the app's
  `user` context) `refreshUser()` call, removing the window entirely
  rather than leaving it to chance.

**Verified:** 106 backend tests still green, both builds clean. Browser
pass per role confirmed: nav links are role-exclusive (parent sees
Plans/Browse/Children/Bookings, provider sees only My Activities, admin
sees the six platform-wide sections and nothing else); admin hitting
`/children` or provider hitting `/plans` now shows the access-denied
page, not the page itself; `/admin/plans` full CRUD cycle (create a
provider tier → edit its name → deactivate → delete) exercised
end-to-end in a real browser, not just unit-tested.

### 2026-07-23 — Trust & Safety Phase 1: Allergy Info, DBS, Social Links, SEND Tagging

First phase of a client-discussion roadmap covering ten potential
features (social marketing, AI suggestions, invoicing, allergy info, SEND
accessibility, provider DBS checks, an AI chat navigator, a kids
leaderboard, charity, and schools-as-a-role). Phase 1 is the contained,
no-external-dependency slice: four small additive schema fields with no
Stripe/LLM/registry integration needed. Later phases (AI, money, schools)
are intentionally deferred — see the roadmap note below.

**Built:**
- `Child.allergyInfo` (free text, nullable) — settable by the parent at
  creation or via a new `PATCH /children/:id`. **Only ever exposed to the
  specific provider running a session that child is booked into** (the
  roster/`attendees` endpoint and the pending-approval list), never in
  any parent-facing list to other parents or any cross-provider view —
  this is special-category health data under UK GDPR, so the exposure
  surface was scoped deliberately narrow, not just "add a field and show
  it everywhere." Rendered as a highlighted `⚠` safety note (new
  `.safety-note` class) on `Roster.tsx` and the pending-approval list on
  `ProviderDashboard.tsx`, not buried in fine print.
- `User.dbsCertificateNumber` / `dbsCertificateExpiresAt` — self-reported
  by the provider (`ProviderDashboard`'s new "Safeguarding" section),
  surfaced to admin on `PendingProviders.tsx` with an expired/missing
  warning (also using `.safety-note`) so it factors into the approve
  decision. **This is not a live DBS registry check** — real-time
  verification needs official umbrella-body registration, not just an
  API key (same class of blocker as Stripe/WhatsApp elsewhere in this
  project). Approval isn't hard-blocked on missing/expired DBS — that's a
  policy call for the client to make explicitly, not something to assume.
- `User.instagramUrl` / `facebookUrl` / `tiktokUrl` — plain URL fields
  (provider-editable, new "Social media" section on `ProviderDashboard`),
  shown as buttons on `ActivityBrowseDetail` alongside the existing
  WhatsApp button. Not a real social API integration (posting/reading
  needs per-platform developer credentials) — just outbound links, same
  seam pattern as WhatsApp's `wa.me` deep link.
- `Activity.isSendFriendly` — provider-declared checkbox on
  `ActivityForm` (creation only; there's no general activity-edit UI yet
  for any field, not just this one), a `sendFriendly=true` filter on
  `GET /activities`, a checkbox filter on `Browse.tsx`, and a badge on
  both the browse list and the activity detail page. Self-reported, not
  independently verified — a filter/badge, not a certification.

**Roadmap note:** the remaining nine items from the client discussion are
sequenced as: Phase 2 (AI analytics suggestions + an AI chat navigator —
needs an LLM API key), Phase 3 (invoicing/receipts + charity — charity
needs a concrete model defined first, e.g. donate-a-credit vs. partner
showcase vs. subsidized places), Phase 4 (kids leaderboard — needs a
safeguarding-conscious design, no public full names of minors), Phase 5
(schools as a third role alongside parents/providers — the biggest,
most standalone piece, saved for last).

**Environment note, not a code issue:** mid-session, the local dev
Postgres database was found completely empty (`User`, `Plan`, `AgeGroup`
all 0 rows) despite nothing in this session's commands (or any test)
issuing a delete — consistent with the migration-tracking oddity flagged
in the previous log entry (no `_prisma_migrations` table). Recovered via
`prisma db seed` + re-inserting the 3 parent credit plans by hand (same
recovery as before). Whoever deploys this for real should not rely on
this dev database's state persisting between sessions, and should
properly baseline migration history first.

**Verified:** 106 backend tests still green, both builds clean. Full
browser flow: provider sets DBS info and social links (confirmed
persisted after a reload) → creates a SEND-friendly activity → parent
filters Browse to SEND-friendly, sees the badge and the provider's
Instagram/Facebook buttons on the detail page → parent adds a child with
allergy info → books the activity → provider's pending-approval list
shows the allergy warning → admin's pending-providers queue shows a
freshly-registered provider's "No DBS certificate on file" warning. Zero
console errors throughout.
