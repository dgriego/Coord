# Coord

Coord is design management for interior design studios. M0 (foundations), M1 (catalog) and M2 (proposals and payments) are built.

- [PLAN.md](PLAN.md): personas, scope, milestones and decisions
- [docs/architecture.html](docs/architecture.html): system map, language choice, request path, hosting and stack
- [docs/plan-visual.html](docs/plan-visual.html): the plan as a visual, with an industry glossary

## Run it

```bash
npm install
npm run dev
```

The web app is at http://localhost:5173 and the API at http://localhost:8790. Without `DATABASE_URL`, the API uses embedded Postgres (PGlite) stored in `apps/api/.data/pg`. Delete that folder to start fresh.

### Sample data

Stop the API first, since embedded Postgres allows only one process. Then run:

```bash
npm run seed
```

This **wipes the local database** and fills it with three sample studios and about four months of activity. It prints links for the open invitations and for a proposal already sent to the Hendersons, which opens the client view. Every account's password is `studio-dev-password` (local database only).

| Sign in as | To see |
|---|---|
| maya@hollis.test | Owner of Hollis Interiors (8 people): full team controls, pending invitations, activity history |
| diane@hollis.test | Admin: can manage the team but can't change the owner |
| jordan@hollis.test, renata@hollis.test | Designers: read-only team page |
| priya@hollis.test, theo@hollis.test | Assistants: no cost access, read-only team page |
| linda@hollis.test | Bookkeeper |
| sam@fernwood.test | In two studios: owner of Fernwood Design Co., designer at Hollis. Use the studio switcher in the top bar |
| noor@ateliernine.test, eli@ateliernine.test | Two co-owners of Atelier Nine, a separate studio that never shows up for Hollis people |

To try the client side, open the printed proposal link. Locally the 6-digit email code appears on the page, and Stripe is simulated: connect it under **Studio settings** (account menu), then pay by card or by bank transfer from the link.

A second checkout (a git worktree) can run beside the first with `PORT=8791 APP_ORIGIN=http://localhost:5174` for the API and `WEB_PORT=5174 API_PORT=8791` for the web app.

## Check it

```bash
npm run ci
```

This runs the typecheck, tests, production build and the performance budget, the same as GitHub Actions.

## Layout

| Path | What's there |
|---|---|
| `packages/shared` | Roles, permissions, input schemas and API types used by both apps |
| `apps/api` | Hono API: auth, studios, team, invitations, audit log, live events |
| `apps/api/src/db/migrations.ts` | SQL migrations, including row-level security |
| `apps/web` | React app: TanStack Router and Query, browser cache, design system |
| `scripts/check-budget.mjs` | Fails CI when the first-load JS or CSS grows past budget |
| `scripts/build-vercel.mjs` | Builds the Vercel output: static web app plus one API function |
| `docs` | Architecture and plan visuals |

## How it works

- **Studio isolation.** Request handlers query through `db.withStudio(studioId, …)`, which runs as the `app_user` role with row-level security scoped to that studio. Only auth code uses the owner connection.
- **Roles.** `packages/shared/src/roles.ts` defines what each role can do. The API enforces it; the web app only uses it to hide controls.
- **Caching.**
  - In the browser, every query result is saved to IndexedDB under a key made of user, studio and permission set, so reloads render without waiting on the network.
  - On the server, `StudioCache` partitions entries the same way and drops a studio's entries whenever its data changes.
- **Live updates.** After a write commits, the API sends the affected query keys on `/api/events` (Server-Sent Events). Open browsers in that studio refetch those queries.
- **Audit log.** Changes to the team and to item pricing are recorded in the same transaction, with values before and after.
- **Pricing.** `packages/shared/src/pricing.ts` prices an item from its parts (markup, target margin, retail less discount, or fixed; COM, freight, tax). The item editor and the API run the same function, so the preview always matches what's saved.
- **Cost hiding.** Roles without `cost.view` get item responses with cost, markup and margin removed on the server (`apps/api/src/catalog/items.ts`), not just hidden in the UI.
- **Proposals.** A proposal has versions; each version snapshots its items' client pricing, so editing an item never changes a sent document. Sending emails the client a share link. A new version replaces an unsigned one, and the link moves to it.
- **Share links.** `/p/<token>` pages are rendered by the API from an allow-listed client view (`serializeShared` in `apps/api/src/proposals/model.ts`), so no cost, margin or vendor can reach them; tests check the JSON and the HTML. The token is an HMAC of the link id with `LINK_SECRET`, so links can be revoked or replaced. Reading needs only the link; approving, signing and paying need a code emailed to the client.
- **E-signature.** The client types their name and agrees; the version stores the name, verified email, time, IP, user agent and a SHA-256 of the exact document signed. Signed versions are final.
- **Payments.** Stripe Connect: each studio onboards its own Express account and checkout runs as a direct charge on it, so Coord never holds funds. Card and ACH; ACH shows as processing until Stripe confirms it settled. Webhooks are signature-checked and only move a payment forward, so retries are harmless. When the deposit is fully paid, approved items move to "deposit paid". Checks and wires can be recorded by hand.
- **Link clipping.** Pasting a product URL fetches the page server-side, reads JSON-LD or Open Graph data, and matches the vendor by site. Private and local addresses are refused, including after redirects.

## Deploy to Vercel

1. Create a Postgres database (Neon or Supabase) and copy its connection string.
2. Import this repository in Vercel. `vercel.json` already sets the install and build commands, so don't pick a framework.
3. In the project's environment variables, set `DATABASE_URL` and `LINK_SECRET` (a long random string; changing it breaks links already sent). Optionally set `APP_ORIGIN` to your custom domain; it defaults to the production `vercel.app` URL. For payments and email, see below.
4. Deploy. The build runs migrations, then writes the web app as static files and the API as one function (`npm run build:vercel`, Build Output API).

Notes:
- Live updates between people use Postgres `LISTEN/NOTIFY`. Use a direct (non-pooled) connection string, because transaction-mode poolers drop notifications.
- Invitation and proposal links point at `APP_ORIGIN`, including on preview deployments.

### Payments and email

| Variable | What it does |
|---|---|
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Turn on client payments. Use test-mode keys first. In Stripe, add a **Connect** webhook endpoint at `<APP_ORIGIN>/api/stripe/webhook` for `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired` and `account.updated`. Without keys, production has no payments and local dev simulates them. |
| `POSTMARK_TOKEN`, `MAIL_FROM` | Send proposal emails and sign-in codes through Postmark. Without them, emails go to the server log. |

## Production on your own server

Set `DATABASE_URL` (Postgres 15+), `APP_ORIGIN` (the public https URL), `LINK_SECRET` and `NODE_ENV=production`, plus the payment and email variables above, run `npm run build`, then `npm start -w @coord/api`. The API serves the built web app. The database user must be allowed to create the `app_user` role on the first migration.
