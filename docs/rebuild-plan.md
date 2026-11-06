# Coord rebuild plan

## Context

Coord (design management for 1–10 person interior design studios) reached M2: catalog, proposals and Stripe deposits. An audit of that code found these problems:

- **Money math is wrong in real cases.** Pricing multiplies by floats, and this was verified: $102.50 at 15% markup gives $117.87 instead of $117.88, and 2.3 yd at $1.05 gives $2.41. Tax rates such as 8.875% cannot be stored. A deposit can be collected twice through an old Stripe session.
- **Code that should be shared is repeated.** About 25 hand-copied route handlers, three different mutation styles, three money parsers, and query keys written as untyped strings, which leads to stale data.
- **Algorithmic problems.** N+1 queries and O(P·I) loops.
- **Pages do too much.** Pages of 550–590 lines mix data fetching, business rules and markup.

We start fresh. We keep `PLAN.md` as the product source of truth (personas, domain model, scope) and keep the **visual direction**: paint chips, Bricolage Grotesque with Figtree, confetti moments, and playful microcopy.

New requirements for the rebuild:

- One canonical pattern for each concern, reused everywhere.
- Atomic UI.
- Readable code.
- O(n) or better on hot paths.
- Stripe handles all payments.
- Money accuracy tested above everything else.
- A **native App Store app from day one**, for time tracking and viewing schedules on site.
- Only mature, actively maintained dependencies.
- Every feature built and reviewed one piece at a time.

## Decisions

✅ = decided by you. ⚙️ = my default; change it at review if you want.

|     | Decision                                                                                      | Why                                                                                                                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅  | Native iOS/Android app at launch (Expo) next to the full web app                              | Field use: timer and schedules on site                                                                                                                                                                                                                                                                                                                      |
| ✅  | Stripe processes all money (Connect, direct charges on each studio's account)                 | Coord never holds funds or card data                                                                                                                                                                                                                                                                                                                        |
| ⚙️  | **Auth: Better Auth**                                                                         | Works for web cookies and the native app (`@better-auth/expo`, secure storage). Includes email code, password reset, passkeys, organizations, roles and invitations, and revoking a session per device. It is the actively maintained successor (the Auth.js team joined it; Lucia is deprecated). Fallback: our own sessions, since the M0 code was sound. |
| ⚙️  | **Hosting: Cloudflare**                                                                       | Workers for the API and web assets, Durable Objects for live updates and rate limits, Queues and Cron for jobs, R2 for files, Browser Rendering for PDFs. Postgres on Neon through Hyperdrive. Uses the `cf` CLI per your global rule.                                                                                                                      |
| ⚙️  | **Invoices:** Coord owns the invoice documents and the math; Stripe Checkout collects payment | Branded client portal like proposals; retainers and time lines; QuickBooks sync                                                                                                                                                                                                                                                                             |
| ⚙️  | **Order:** Client Onboarding, then Payments, then Procurement, then Time & Billing            | As PLAN.md                                                                                                                                                                                                                                                                                                                                                  |

## Ground rules (enforced, not aspirational)

1. **Pattern registry.** `docs/patterns.md` lists the one canonical way to do each concern: endpoint, query, command, form, auth check, error, audit, job, document, atom. Before writing new logic, the slice brief must name the patterns it reuses. A new pattern needs a short decision record (`docs/adr/NNN-*.md`) and your approval.
2. **Dependency admission.** No package is added without an entry in `docs/dependencies.md` showing:
   - its maintainer (a company or core team);
   - a release within the last 6 months;
   - adoption;
   - its security advisory history;
   - its license;
   - its bundle cost;
   - an exit plan.

   Prefer official SDKs and platform features. Pin exact versions and use Renovate with CI gating.

3. **Readability.**
   - TypeScript strict, including `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
   - ESLint and Prettier.
   - Functions of 40 lines or less; files of 250 lines or less, with exceptions noted.
   - Names that read as sentences.
   - Comments explain _why_, not _what_.
4. **Complexity.**
   - Every list endpoint runs a fixed number of queries. Tests assert a **query budget** per endpoint (a counting DB wrapper).
   - Grouping uses `Map`, never nested `find` or `filter`.
   - Long lists are paginated or virtualized.
   - Large-fixture performance tests: 1,000 items and 10,000 time entries.
5. **Boundaries.** `dependency-cruiser` rules enforced in CI:
   - `money` and `domain` import nothing from apps;
   - `ui-*` never imports `api`;
   - pages never call `fetch`.
6. **Privacy and security.**
   - One logger that takes an allow-list of fields, like the serializers. Client details never reach it; a test fails if they do.
   - Error responses carry a code and a safe message only. Details stay in server logs, without client data.
   - Every endpoint has a permission and audience; API tests cover another studio, a missing role and an expired session.

## Vetted dependencies

| Dependency                           | Purpose                                       | Maintained by                                     | Why it passes                                                                          |
| ------------------------------------ | --------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| TypeScript, Node 22 LTS              | Language                                      | Microsoft / OpenJS                                | Standard                                                                               |
| Hono                                 | API routing                                   | Core team, sponsored by Cloudflare                | Native to Workers, widely used                                                         |
| Zod                                  | Schemas                                       | Colin McDonnell plus core team                    | Ubiquitous                                                                             |
| Drizzle ORM + drizzle-kit            | Typed SQL and migrations                      | Drizzle Team (company)                            | Active, large adoption; one schema source generates the migrations. Fallback: Kysely   |
| Better Auth                          | Auth                                          | Better Auth Inc. plus the Auth.js team            | Most active TS auth library; Expo plugin                                               |
| Postgres (Neon) via Hyperdrive       | Database                                      | Databricks / Cloudflare                           | Managed, proven                                                                        |
| PGlite                               | Local and test Postgres                       | ElectricSQL (company)                             | Already proven in M0–M2 tests                                                          |
| `stripe` official SDK                | Payments                                      | Stripe                                            | Idempotency keys, API version pinning, `constructEventAsync` on Workers                |
| TanStack Query and Router            | Data and routing on web; Query also on native | TanStack (company and sponsors)                   | Proven                                                                                 |
| TanStack Virtual                     | Virtualized grids                             | TanStack                                          | Proven                                                                                 |
| React 19, Vite                       | Web                                           | Meta / VoidZero                                   | Standard                                                                               |
| Expo SDK, Expo Router, EAS           | Native app                                    | Expo (company)                                    | The standard React Native path                                                         |
| react-native-mmkv                    | Native cache and offline queue                | Margelo (company)                                 | Proven, fast                                                                           |
| Postmark                             | Email                                         | ActiveCampaign                                    | Deliverability                                                                         |
| Cloudflare Browser Rendering         | PDFs (HTML → Chromium)                        | Cloudflare                                        | Same HTML/CSS as the share page; most proven PDF approach                              |
| Vitest, fast-check, StrykerJS        | Unit, property and mutation tests             | Vitest team / dubzzz plus sponsors / Stryker team | All active for years                                                                   |
| Playwright                           | Web e2e and visual tests                      | Microsoft                                         | Proven                                                                                 |
| Maestro                              | Native e2e                                    | mobile.dev (company)                              | Simpler and less flaky than Detox; active                                              |
| Storybook (web and React Native)     | Component gallery                             | Chromatic plus community                          | Larger maintainer base than Ladle                                                      |
| ESLint, Prettier, dependency-cruiser | Code quality                                  | OpenJS / Prettier team / long-lived (since 2016)  | Proven. Biome was rejected for now: younger plugin ecosystem, and no boundaries plugin |

## Repo layout (fresh start)

- Tag the current `main` as `legacy-m2`. Delete `apps/*` and `packages/*`.
- Port deliberately, through review, rewriting each piece in the new patterns:
  - the CSV parser;
  - the product-page parser, with the SSRF guard fixed (IPv6-mapped and NAT64 addresses, DNS pinning);
  - the Stripe signature and simulator idea;
  - the serializer allow-list idea;
  - the design tokens.

```
packages/
  money/      exact integer money kernel (no deps)
  domain/     pure business rules: pricing, totals, status machines, time billing, allocation
  contract/   endpoint definitions + query-key factory + audiences (zod)
  data/       TanStack Query hooks: queries + useCommand (shared web + native)
  tokens/     design tokens → CSS vars (web) + theme object (native)
  ui-web/     atoms / molecules / organisms (DOM + CSS), Storybook
  ui-native/  same component APIs in React Native, Storybook RN
apps/
  api/        Hono on Workers: implement(endpoint), domains/*, jobs/*, share pages
  web/        React + Vite SPA (full power-user app)
  mobile/     Expo app (field work: timer, time, My Day, schedules)
docs/         patterns.md, adr/, dependencies.md, money-policy.md, features/<group>/<slice>.md
```

## Canonical patterns (sketches)

**1. One endpoint contract, used by both server and client.** Invalidation is declared once, here.

```ts
export const updateItem = endpoint({
  method: "PATCH",
  path: "/items/:itemId",
  params: z.object({ itemId: id }),
  body: itemPatch,
  response: itemView,
  permission: "projects.edit",
  audience: "staff",
  invalidates: ({ params }, item) => [keys.item(params.itemId), keys.project(item.projectId)],
});
```

`keys` is a typed key factory. The server broadcasts these keys and the client invalidates the same ones, so stale-key bugs can't happen. Responses are always the entity, or `{ items, nextCursor }` for lists.

**2. The server wrapper.** It does everything except the domain logic:

- validates params, query and body (a bad id returns 404, not 500);
- resolves the session from a cookie or a bearer token;
- checks permission;
- opens an RLS transaction (a read-only fast path for GETs);
- binds `audit()` to that transaction;
- writes jobs and invalidations to an **outbox** in the same transaction, then delivers them after commit;
- serializes by audience.

```ts
export default implement(updateItem, async ({ params, body, tx, audit }) => {
  const before = await items.find(tx, params.itemId);
  const after = await items.update(tx, params.itemId, body);
  await audit("item.updated", before, after);
  return after;
});
```

**3. Each domain folder** (`apps/api/src/domains/<x>/`) holds `queries.ts` (reads, fixed query count), `commands.ts` (writes), `serialize.ts` (the audience allow-lists) and `routes.ts`. Pure rules live in `packages/domain`.

**4. Status machines.** `defineMachine({ draft: ["sent"], sent: ["partially_approved", "approved", "superseded"] })` with `assertTransition`, tested exhaustively for every pair.

**5. Client data.**

- Reads: `useQuery(queries.project(id))`.
- Writes: **one** `useCommand(endpoint, { optimistic })`. It handles cancel → snapshot → apply → rollback → invalidate from the contract, a global error toast, the 401 redirect, and `celebrate()` only after the server confirms.
- Live events are ignored when they are this client's own echo (a per-tab client id).
- Persisted cache: a version number that discards old caches ("buster") plus an allow-list of what gets saved.
- Routes load lazily.

**6. Forms.** One form pattern everywhere:

- the input schema comes from the contract;
- a controlled draft holds the edits;
- field atoms;
- the server's field errors are shown on the fields themselves.

`MoneyInput`, `RateInput`, `QuantityInput` and `DurationInput` all parse through `packages/money`.

**7. Atomic design.**

- **Tokens:** one source, compiled to CSS custom properties and a native theme object.
- **Atoms:** Button, IconButton, Input, Select, Checkbox, Pill/StatusBadge, Chip, Avatar, Thumb, Skeleton, Kbd, Text/Heading, Stack/Row.
- **Molecules:** Field, SearchInput, SegmentedControl, Tabs, Menu/Popover, Toast, StatTile, InlineEdit, ConfirmButton, ColorPicker.
- **Organisms:** DataTable (virtualized), Drawer (focus trap), Dialog, PageHeader, CommandPalette, RoomGroup, EmptyState.
- **Fun primitives:** `celebrate()`, a microcopy registry, paint scopes.
- Every component appears in Storybook and has a visual snapshot.
- `ui-web` and `ui-native` share prop names. Logic lives in shared headless hooks, such as `useTimer` and `useScheduleView`.

**8. Auth.**

- Better Auth tables are managed by drizzle-kit. Its organization equals our studio; the active organization becomes `app.studio_id` for RLS.
- Roles map to our permission table in `domain/roles`.
- Web uses httpOnly cookies, and the Origin/CSRF check applies to cookie requests only. Native uses a bearer token stored in SecureStore.
- Rate limits live in a Durable Object, keyed by IP plus email.
- "Sign out this device" and "sign out everywhere".
- No social login at launch: App Store rule 4.8 would otherwise require Sign in with Apple.
- Outside parties (clients, vendors, contractors) use HMAC share links. Actions that need accountability are verified with an email code (atomic attempt counter, constant-time compare).

**9. Documents.**

- Each document type has one server-side **document view model**: procurement proposal, invoice, PO, schedule.
- The share page and the PDF render the **same** HTML template from that model, with a CSP header.
- The PDF comes from Browser Rendering and is cached in R2 by content hash.
- Tests extract the PDF text and assert that every number equals the model.
- **Contracts are the one exception.** The studio's uploaded PDF is the template, so values are written onto a copy of it rather than rendered from HTML. This is a new pattern, so slice D1 needs a decision record and your approval. Tests still extract the PDF text and compare every value.

**10. Jobs.**

- The outbox flows into Queues. External calls (Stripe, Postmark, QuickBooks) **never** run inside a DB transaction, and each carries an idempotency key equal to our row id.
- Cron runs reminders and the nightly reconciliation.

**11. Native app versioning.**

- Contract changes are additive only, with deprecation before removal.
- The app sends an `x-app-version` header. Below the minimum version, the API returns `426 update_required`, which the app handles gracefully.
- JavaScript fixes ship through EAS Update.

## Money kernel and policy (the accuracy gate)

- **Types** (all integers; `Number.isSafeInteger` asserted):
  - `Cents`;
  - `Rate` in parts per million (8.875% = 88,750);
  - `Qty` in thousandths (2.3 yd = 2,300);
  - `Seconds` for time.
- **One primitive:** `mulDiv(a, b, divisor, rounding)` computed with BigInt internally.
  - Rounding is half away from zero; credits are symmetric.
  - Markup = `mulDiv(cost, 1e6 + rate, 1e6)`. No float ever touches money.
- **`allocate(total, weights)`** uses largest remainder, so tax or a discount split across lines always sums exactly.
- **One `parseMoney`/`parseRate`/`parseQty`** for the web, the native app, the clipper and CSV import. Each has a table of accepted and rejected inputs ("1e3", "0x10", "1.250,00", 3 decimals, and so on). One `formatMoney` with a cached `Intl.NumberFormat`.
- **`docs/money-policy.md`** (you approve it) records where rounding happens for each document. It also covers:
  - how the optional contract deposit is calculated, applied and refunded;
  - paying procurement proposals in full;
  - time billing increments, set per studio (1, 6 or 15 minutes), applied per entry;
  - how invoice time lines are summed per entry;
  - negative and credit lines;
  - overpayment handling.
- **Tests:**
  - property tests (fast-check) against a BigInt rational reference;
  - golden fixture tables, including every boundary found in the audit, plus spreadsheets from beta studios;
  - invariants after every API test: sum of lines = total; subtotal + tax = total; deposit applied plus refunds never exceeds the deposit paid; paid ≤ due, or else flagged;
  - **100% branch coverage** on `money` and `domain`;
  - **StrykerJS mutation score of at least 90%** on those packages.
- **Database guards:**
  - CHECK constraints on every money and rate column;
  - a trigger that blocks changes to sent or signed versions and issued invoices;
  - payments and the ledger are append-only for the app role;
  - `RESTRICT` instead of `CASCADE` from payments to projects;
  - a partial unique index allowing one open checkout per document;
  - one running timer per user.
- **Concurrency tests run on real Postgres** (`FOR UPDATE`) in CI.

**Stripe flow**

1. Lock the document row and compute the amount due on the server.
2. Expire the previous open Stripe session.
3. Insert a pending payment and commit.
4. The outbox creates the Checkout session with idempotency key = payment id and a pinned API version.
5. The webhook path:
   - verify the signature;
   - insert the raw event (event id unique, so duplicates are dropped);
   - put it on the queue;
   - process it under a row lock with forward-only status.
6. Mismatched amounts or currency go to **needs_review** with an alert.
7. Refunds, disputes and late ACH returns are mirrored back into Coord.
8. A manual check payment expires any open session.
9. Nightly reconciliation compares Stripe's balance transactions with our ledger.

## Workflow for every slice (definition of done)

1. **Brief.** `docs/features/<group>/<slice>.md`:
   - the user story;
   - in and out of scope;
   - patterns reused (by registry name);
   - new atoms;
   - schema;
   - endpoints;
   - money rules;
   - mobile impact;
   - test plan;
   - the "fun moment";
   - the demo script.

   **You approve the brief before any code is written.**

2. Schema and migration (drizzle-kit, plus RLS and constraints).
3. Pure domain functions and their tests. Money slices also need property tests, mutation tests and fixtures.
4. Contract and API tests: permissions, forbidden fields per audience, query budget, invariants.
5. Atoms and molecules in Storybook, with visual snapshots.
6. Page or screen built only from those components.
7. End-to-end tests:
   - Playwright on desktop and at mobile web width;
   - Maestro on iOS and Android when the slice touches the native app.
8. Performance budgets: 200 KB JS and 30 KB CSS gzipped on the initial route; API p95 under 200 ms; navigation from cache under 100 ms.
9. **Self-review.** Claude reviews the slice's diff for bugs, logic errors, privacy and security issues, and query counts, and fixes what it finds.
10. **A demo for you.** Then merge, update the pattern registry, and move to the next slice.

## Phases and slices (in order; 💰 = money gate, 📱 = native work)

**Phase 0: Foundations**
0.1 Fresh repo, tooling, CI, boundaries, budgets.
0.2 💰 Money kernel and money policy document.
0.3 Contract, `implement()`, errors, query-budget helper.
0.4 DB: drizzle-kit schema, RLS, outbox, audit, test harness (PGlite plus real Postgres in CI).
0.5 Live updates (Durable Object per studio, echo filter).
0.6 Tokens and core atoms in Storybook, web and native.
0.7 Web shell: router, lazy routes, persisted cache, command palette.
0.8 📱 Expo shell: tabs, theme, MMKV cache, EAS builds, version gate, Maestro smoke test.

**A. Studio & People**
A1 📱 Sign up, sign in, email code, password reset.
A2 Studios, switching studios, roles.
A3 Invitations.
A4 Studio settings and branding.
A5 Audit log viewer.
A6 📱 Devices: sign out this phone; account deletion (an Apple requirement).
A7 Studio setup questions: how the studio charges, deposits and reimbursables (PLAN.md 6.10).

**B. Directory**
B1 Clients and contacts, including tax exempt status with a certificate.
B2 Vendors: categories and trade accounts.
B3 💰 CSV import: dry run, then commit, with the shared parsers.

**C. Projects & Catalog**
C1 Projects and rooms.
C2 💰 Items and COM components, with the pricing engine on the money kernel.
C3 Images on R2.
C4 Virtualized item grid.
C5 URL clipper with the hardened SSRF guard.

**D. Client Onboarding** (PLAN.md 6.9)
D1 Contract upload: the studio's PDF stored on R2, with versions. Includes the decision record for writing onto PDFs.
D2 Choose fields: place, name and type fields on the pages, including the signature.
D3 💰 Fill in for a new client: values from Coord's data, deposit calculation, preview, frozen contract PDF, every value tested against the file.
D4 Client share portal and email code, reused by every client document.
D5 💰 E-sign: hash of the full document, a stored copy, the consent text, reused by procurement proposals.

**E. Payments**
E1 Stripe Connect account setup.
E2 💰 Contract deposit checkout, straight after signing: one open session, outbox. F5 reuses it.
E3 💰 Webhook ingestion and ledger.
E4 💰 Manual payments, refunds, disputes, ACH returns.
E5 💰 Nightly reconciliation and the needs-review queue.

**F. Procurement**
F1 💰 Procurement proposals: generated from items with pricing and freight; versions and snapshots.
F2 Proposal client link, using the D4 portal.
F3 Approve or reject per line, and sign using D5.
F4 💰 Proposal PDF.
F5 💰 Payment in full on approved lines, using the E2 checkout. Nothing is ordered until the client has paid.
F6 💰 POs per vendor from components.
F7 Vendor link: acknowledge, ship date, tracking, invoice upload, CFA cuttings.
F8 Procurement board and follow-ups.
F9 📱 Receiving and damage, with phone photos.
F10 💰 Vendor deposits and bills.

**G. Time & Billing**
G1 📱 Timer: start time held on the server, one running timer per user, live across devices, offline queue with idempotency.
G2 📱 Manual entries and week view.
G3 💰 Hourly rates and billing increments, plus flat fees for studios that use them.
G4 💰 Reimbursables and expenses, for studios that turn them on.
G5 💰 Invoices built from the studio's setup answers: billable time, flat fees, reimbursables, product changes, any deposit applied.
G6 💰 Invoice portal, PDF, Stripe payment.
G7 💰 QuickBooks Online sync, idempotent, with a sync log.
G8 📱 Lock-screen timer: iOS Live Activity and Android ongoing notification.
G9 Project hours and the "past the deposit" marker (PLAN.md 6.9).

**H. Schedules & Approvals**
H1 Schedule types and tag codes, suggested and editable.
H2 Issued revisions with changes marked.
H3 📱 Schedules on the phone, cached offline.
H4 Contractor link and PDF.
H5 Approvals that block ordering.

**I. Project Flow**
I1 Phases and tasks.
I2 Templates.
I3 📱 My Day.
I4 Project health.

**J. Hardening & Launch**
J1 DesignSmart and Programa import.
J2 💰 Profit and AR reports.
J3 Accessibility pass.
J4 Load tests.
J5 Full security review (each slice already gets its own in step 9).
J6 📱 App Store and Play readiness: privacy labels, no in-app subscription purchase.

## Verification

- **Every slice:** `npm run ci` runs, in order:
  - typecheck;
  - lint and boundaries;
  - unit and property tests;
  - coverage gate;
  - Stryker on changed money and domain code;
  - API tests on PGlite and real Postgres;
  - Playwright desktop and mobile;
  - the budget check.
- **Mobile slices:** `maestro test apps/mobile/e2e` on the iOS simulator and the Android emulator, plus an EAS preview build installed on a real phone for the demo.
- **Money phases:** run the golden fixtures through both the domain function and the API.
  - D–E: complete a real deposit end to end in Stripe test mode, including:
    - a replayed webhook;
    - two tabs paying;
    - a manual check while a session is open;
    - a refund.

    Reconciliation must report zero differences.

  - G: QuickBooks sandbox re-sync creates no duplicates; PDF text matches the view model.

- **Long-running work:** builds, test suites and agents run in the background and are checked rather than waited on blindly. Anything running past its expected time is investigated or stopped, and you are told.
