# Coord: Build Plan

This is the top-down plan to settle before writing code. Each section either records a decision or lists what still needs to be decided. Build milestones are in section 13.

---

## 1. Decisions already made

| # | Decision | What it means for the build |
|---|---|---|
| D1 | **The accounting system is the source of truth for the books.** We don't build accounting. | We own items, proposals, POs, time and invoices as *documents*. Invoices, payments and bills sync to QuickBooks Online (QBO), which owns the ledger, tax filing and the P&L. No general ledger, bank reconciliation or payroll. |
| D2 | **No formal submittals.** | Replaced by a light **Approvals** feature (see 6.6) covering CFAs, shop drawings and slab or sample approvals. |
| D3 | **US only.** | USD only, US sales-tax model, US date and number formats. Money is stored in integer cents with a currency column (always USD for now) so other currencies can be added later. |
| D4 | **We process client payments** through Stripe Connect. | See section 11 for compliance. |
| D5 | **Receiving and warehouses are in scope.** | Receiving locations, receiving records, damage tracking. Full inventory accounting is out of scope. |
| D6 | **Outside parties use secure share links.** | No client, vendor or contractor accounts. Links are signed and revocable. Actions that need accountability (approve, pay, sign) are verified with an email code. |
| D7 | **Target 1–10 person studios.** Must clearly beat DesignSmart. | Simple defaults, nothing gated behind add-on modules, and depth that can be turned on as needed rather than shown up front. |
| D8 | **Integrate with design tools rather than building them.** | Mood boards and floor plans are links and embeds, plus image import. We build only the product clipper. |
| D9 | **Local-first is optional.** | Build in this order: a cache stored in the browser, optimistic updates, real-time invalidation. Keep the data layer swappable for a sync engine later. |

### What DesignSmart has (the baseline to beat)
According to its public listings: proposals, invoices, purchase orders, time tracking, QuickBooks integration, task reminders, an image library and card payments. It runs on the web or on-premise, starts at about $52 per month, and its modules are sold separately. ([Capterra listing](https://www.capterra.com/p/192463/DesignSmart/))
**How we win:** everything is included with no modules, a modern fast UX, a clipper, a client portal through share links, tracking after the PO, schedules, and COM handling.

---

## 2. Product principles (used to break ties)

1. **Speed is a feature.** Every screen after the first renders from cache in under 100 ms. Every edit shows up immediately and saves in the background.
2. **Enter it once, use it everywhere.** An item is entered one time and then feeds the proposal, the POs, the schedule, the budget and the tasks.
3. **Simple first, deep when needed.** A solo designer never sees warehouse receiving unless they turn it on. Advanced fields sit behind a "More" toggle.
4. **Money logic must be exactly right.** Pricing, tax and deposit math is computed on the server, unit-tested with fixture cases, and never typed in by hand.
5. **Never leak cost.** Cost and markup are stripped *on the server* for every outside or limited view. The client UI never decides this.
6. **Keyboard and grid editing for power users**, large touch targets for site work, and readable client links on phones.

---

## 3. Personas, jobs and use cases

Priority: **M** = MVP, **L** = later.

### 3.1 Maya, solo principal (1–3 people)
| Use case | Pri |
|---|---|
| Create a project from a template (phases and tasks) in under a minute | M |
| Clip products from vendor sites into a project room | M |
| Build a proposal by room, send it as a link, client approves and pays the deposit online | M |
| Turn approved items into POs grouped by vendor with one click | M |
| Track time from her phone between site visits and bill it on the next invoice | M |
| See "what needs me today" across all projects | M |
| Sync invoices and payments to QBO without entering them twice | M |
| Import vendors and clients from a spreadsheet or DesignSmart export | M |

### 3.2 Diane, studio owner (5–10, eventually up to 50)
| Use case | Pri |
|---|---|
| Invite staff and set roles, hiding margins from juniors | M |
| See profit per project: product margin plus fees minus unbilled time | M |
| Approve POs above a set amount before they're sent | L |
| Check utilization (billable versus non-billable hours by person) | L |
| Brand documents with logo, colors and terms | M |
| Set studio defaults: markup, deposit %, fee type, payment terms | M |

### 3.3 Jordan, senior designer / PM
| Use case | Pri |
|---|---|
| One project view showing phase, tasks, items awaiting approval and late orders | M |
| Revise a proposal after the client changes their mind, with version history kept | M |
| Send approval requests (CFA, shop drawings) to the client or herself | M |
| Issue a lighting or plumbing schedule to the contractor and send revisions with changes marked | M |
| Log site visits with photos and a punch list during CA | L |

### 3.4 Priya, junior designer
| Use case | Pri |
|---|---|
| Clip or paste a URL to get an item with image, dimensions, SKU, price and vendor | M |
| Edit many items in a spreadsheet-style grid (quantity, finish, room) | M |
| Look up vendors by category, location or trade account | M |
| See only her assigned tasks, and only the fields her role allows | M |

### 3.5 Linda, studio manager / procurement / bookkeeper
| Use case | Pri |
|---|---|
| See all open POs and what's overdue: unacknowledged, past ship date, backordered | M |
| Record vendor acknowledgments, ship dates and tracking (vendor can update through a link) | M |
| Receive items at the warehouse with photos, and log damage claims | M |
| Record vendor deposits and match vendor invoices to POs, then sync bills to QBO | M |
| Track client deposits, retainers and what has been applied to invoices | M |
| See AR aging and unbilled time | L |

### 3.6 Outside parties (share links only)
| Party | Use case | Pri |
|---|---|---|
| Client | View the proposal, approve or reject each item, comment, e-sign, pay by card or ACH | M |
| Client | See a simple project status page (phase, upcoming milestones) | L |
| Vendor | View the PO, acknowledge it, enter the ship date and tracking, upload an invoice | M |
| Contractor | View the latest schedule on a phone, see what changed, download a PDF | M |

---

## 4. Scope

### MVP: the "replace DesignSmart" release
- Studios, users, roles, invitations
- Clients and contacts; vendors with categories and filters
- Projects, rooms, phases, tasks (including tasks linked to items) and project templates
- Items: clipper, images, the pricing engine, COM components
- Proposals: versions, share link, approve or reject, e-sign, deposit payment
- POs: generated from approved items, one per vendor; email or share link; vendor acknowledgment
- Order tracking and receiving, including the warehouse
- Schedules: lighting, plumbing, finishes, paint, hardware, custom; tag codes; revisions; contractor link; PDF
- Approvals (the submittals-lite feature)
- Time tracking (timer and manual), hourly and flat fee billing
- Invoices: fees, time, product, reimbursables; retainers applied; Stripe payments
- QBO sync: customers, invoices, payments, vendors, bills
- Branded PDFs for proposals, POs, invoices and schedules
- Import from CSV (vendors, clients, items)
- Dashboard: "My day" and a project health view
- Sales tax: project rate, taxable flags per charge type, exempt clients with certificate upload

### v1.1
- PO approval limits; utilization and profit reports; AR aging
- Site visits and punch lists
- Gmail and Outlook connection (threads linked to projects)
- Client project status page
- Cost-plus and percent-of-purchase fee types
- Mood-board and design-tool integrations (Canva, SketchUp and similar: link, embed, import images)
- Mobile PWA polish, including offline time entry

### v2
- Xero support
- AI extraction from vendor tear sheets and PDFs into items
- Shared vendor directory across studios
- Lead pipeline and engagement letters
- A sync engine for full local-first use, if users ask for it
- Teams of 10–50: departments, approval chains, permissions per project

### Out of scope
General ledger, payroll, 3D or floor-plan editing, marketing and lead generation, multi-currency, formal submittal logs.

---

## 5. Domain model

```
Studio ─┬─ User (role) ─ TimeEntry
        ├─ Client ─ Contact
        ├─ Vendor ─ VendorContact, VendorCategory[], TradeAccount
        ├─ ReceivingLocation (studio office, warehouse, job site)
        ├─ Template (project, task list, document branding, terms)
        └─ Project ─┬─ Room
                    ├─ Phase ─ Task (→ optional Item link)
                    ├─ Item ─┬─ ItemComponent (main piece, COM fabric, trim, freight…)
                    │        ├─ ItemImage, ItemAttachment
                    │        ├─ Approval (CFA, shop drawing, sample)
                    │        └─ ScheduleEntry (optional, one per schedule)
                    ├─ Proposal ─ ProposalVersion ─ ProposalLine (snapshot of Item pricing)
                    ├─ PurchaseOrder ─ POLine (→ ItemComponent) ─ Shipment ─ ReceivingRecord
                    ├─ Schedule ─ ScheduleRevision (issued snapshot)
                    ├─ Invoice ─ InvoiceLine (fee | time | product | reimbursable | retainer-applied)
                    ├─ Payment (client → studio, via Stripe or recorded manually)
                    ├─ VendorDeposit / VendorBill (studio → vendor, synced to QBO)
                    ├─ Expense (reimbursable)
                    └─ ShareLink (→ any shareable document version)
```

### Key modeling rules
1. **Item is the central record.** Proposal lines, PO lines and schedule entries all reference it. Proposals and issued schedules store **snapshots**, so a later edit never silently changes a document that was already sent.
2. **COM and multi-vendor items.** An `Item` has one or more `ItemComponent`s, each with its own vendor and cost. *Custom sofa = frame and labor (Workroom A) + 14 yd fabric (Fabric House B, ship to Workroom A).* The client sees **one line**. Generating POs produces **one PO per vendor**, and each component records its ship-to address, which can be another vendor.
3. **An item is procured, specified or both.** `procured`: goes on the proposal and a PO. `specified`: goes on a schedule and the contractor buys it. One sconce can be both, entered once.
4. **Pricing engine** (one pure function on the server, unit-tested):
   - Each component: `net_cost × qty`, plus freight, crating, receiving and install charges
   - Client price by mode: **markup** `cost × (1 + m)`, **margin** `cost ÷ (1 − g)`, **MSRP minus discount**, or a **fixed** price
   - Tax applies to the charge types the project marks taxable (states differ on taxing freight and install). Exempt clients have $0 tax and a certificate on file.
   - Deposit % comes from the studio default, can be changed per proposal, and can be changed per line
   - Rounding: compute in cents and round at the line level, using one documented rule everywhere
5. **Status rules** live in code, not in free-form status fields:
   - Item procurement: `draft → proposed → approved | rejected → deposit_paid → ordered → acknowledged → in_production → shipped → received → delivered → installed → closed`, with side branches `backordered`, `damaged`, `cancelled`
   - An item's status is **calculated** from its components' PO lines: the item is only as far along as its slowest component
   - Proposal: `draft → sent → partially_approved → approved → superseded`
   - PO: `draft → sent → acknowledged → partially_received → received → closed | cancelled`
6. **Multi-tenancy:** every row has a `studio_id`. Postgres row-level security (RLS) is a second line of defense behind checks in the application code.
7. **Audit log** for anything involving money or approvals: who did what, when, with values before and after.

---

## 6. Core workflows (end to end)

6.1 **Sourcing:** clip, choose the project and room, the app guesses vendor, price and dimensions, the user confirms, the item is added as a draft.
6.2 **Proposal to deposit:** select items, create a proposal version, send the share link, the client approves lines (email code), e-signs and pays the deposit. Items move to `deposit_paid`, a payment is recorded and synced to QBO, and a task "Order approved items" is created.
6.3 **Order:** "Generate POs" groups the approved components by vendor. The studio reviews, then sends by email with a PDF and vendor link. The vendor acknowledges and enters a ship date. A vendor deposit is recorded and the bill syncs to QBO.
6.4 **Tracking:** an automatic follow-up task appears if a PO is unacknowledged after N days or past its ship date. The procurement board shows everything by status.
6.5 **Receiving:** the warehouse or studio records a receipt with photos. Damage leads to a claim and a task. Delivery and install close out the item.
6.6 **Approvals (submittals-lite):** attach a CFA, shop drawing or slab photo to an item. Request approval from the client (link) or a designer (internally). Outcome is `approved`, `approved as noted` or `revise and resubmit`. The item can't be ordered until required approvals clear.
6.7 **Schedules:** add specified items to the lighting or plumbing schedule. Tag codes such as L-1 are assigned automatically. "Issue revision" freezes a snapshot. The contractor link always shows the latest revision with changes marked, and a PDF is generated.
6.8 **Billing:** time entries and fees, plus product balances and reimbursables, go on an invoice with any retainer applied. Send the link, the client pays, and it syncs to QBO.

### Submittals compared with designer approvals
In commercial construction a *submittal* is the contractor formally submitting shop drawings, product data and samples to the architect or designer for approval, tracked in a numbered log. Residential designers don't keep that log, but they make the **same kind of approval decisions** constantly: fabric CFAs, upholstery and millwork shop drawings from workrooms, stone slab selection, paint drawdowns, tile samples, lighting cut sheets. The **Approvals** feature covers this, and it can block an order until approval is given, which prevents costly reorders. A formal log can be added later if commercial users need one.

---

## 7. Permissions

| Role | Sees cost and markup | Edits pricing | Sends documents | Payments and QBO | Studio settings |
|---|---|---|---|---|---|
| Owner | ✔ | ✔ | ✔ | ✔ | ✔ |
| Admin / Manager | ✔ | ✔ | ✔ | ✔ | Limited |
| Designer | Configurable | Configurable | ✔ | ✗ | ✗ |
| Assistant | ✗ | ✗ | Configurable | ✗ | ✗ |
| Bookkeeper | ✔ | ✗ | Invoices only | ✔ | ✗ |

- The server shapes each response by **field-level permission set** (for example `can_view_cost`). Cache keys include that permission set (see 9.3).
- Share links have a fixed **audience scope** (`client`, `vendor` or `contractor`), and each scope has a hard-coded list of allowed fields. A vendor link shows cost and **never** client price. A client link shows client price and **never** cost.

---

## 8. Architecture and stack

### Decision: TypeScript backend, not Rust (Oct 27, 2026)
Asked: would a Rust backend maximize speed? For this product it wouldn't make a difference users can feel.
- **Where time goes:** after the first visit, screens render from the browser cache in under 100 ms and edits show instantly, so the server is rarely on the critical path. When it is, a request spends about 1 ms in our code and 20–80 ms on the network and in Postgres. Rust could cut that 1 ms to 0.2 ms, which nobody can see.
- **Load:** studios of 1–50 people produce a few requests per second at most. Rust's advantages (throughput, memory, tail latency under heavy load) matter at thousands of requests per second.
- **Cost:** UX is the top priority, so iteration speed matters most. One language end to end lets the pricing engine, permissions and validation run identically in the browser and the server. In Rust they'd be written twice and could drift apart. It would also mean rewriting M0 and M1, which already work and are tested.
- **Revisit when:** one specific job is measured to be CPU-heavy, such as PDF rendering, image processing or large imports. That job can become a Rust worker or a WASM module without changing the rest.

### Decision: deploy on Vercel
- The web app is static files on Vercel's CDN. The API is one Vercel Function, a Node handler built with the Build Output API (`npm run build:vercel`).
- **Database:** hosted Postgres (Neon or Supabase) through `DATABASE_URL`. Migrations run during the build, not on cold start, so two instances never race.
- **Live updates across instances:** Postgres `LISTEN/NOTIFY` replaces the in-memory event bus whenever `DATABASE_URL` is set.
- **Server cache:** off on Vercel, because instances don't share memory. The browser cache does most of the work. Redis (Upstash) can bring it back later.

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript across the whole stack, npm workspaces monorepo | Types shared between client, server and PDF templates |
| Web app | React + Vite SPA, TanStack Router, TanStack Query, TanStack Table with virtualization | App-like speed, loaders that prefetch per route, a fast grid |
| Share pages | Server-rendered by the API (lightweight HTML, very little JS), cached at the edge | Clients open links on phones and need the first view to be instant |
| API | Hono on Node, zod-validated typed routes (or tRPC) | Fast, simple, runs on the edge or on Node |
| Database | Postgres (Neon or Supabase) + Drizzle ORM; `pg_trgm` and full-text search for search | One datastore, RLS, adequate search for the MVP |
| Cache / queue | Redis (Upstash or managed) for hot aggregates and rate limits; **pg-boss** for jobs | Fewer moving parts |
| Files / images | Cloudflare R2 + Cloudflare Images (or imgproxy) | Cheap storage and on-the-fly AVIF and WebP |
| PDFs | Same React components rendered to HTML, then Playwright/Chromium in a worker | One template system for screen and PDF |
| Real-time | Server-Sent Events channel per studio that pushes entity invalidations | Simple and fits through proxies |
| Auth | Better Auth (organizations, invitations, passkeys) or WorkOS | Multi-tenant, with SSO possible later |
| Email | Postmark for transactional and outbound documents; inbound parsing later | Reliable delivery for POs and invoices |
| Payments | Stripe Connect (Express or Standard) + Stripe Elements / Checkout | See section 11 |
| E-sign | Built-in click-to-sign (typed name, timestamp, IP, document hash) for the MVP; Dropbox Sign or DocuSign later if needed | ESIGN Act–compliant for proposals |
| Clipper | Chrome extension (Manifest V3); Safari later | Reads schema.org/Open Graph data, with parsers per vendor site for the top vendors |
| Hosting | API and workers on Fly.io or Render; static assets and the CDN on Cloudflare | Simple operations at this stage |
| Observability | Sentry, OpenTelemetry, real-user monitoring (RUM) of Web Vitals | Enforces the performance budgets |

**Leaving room for local-first:** all reads go through TanStack Query keyed by normalized entity IDs, and all writes go through a single mutation layer. Moving to a sync engine (Zero, Replicache or ElectricSQL) later replaces that layer, not the screens.

---

## 9. Performance and caching

### 9.1 Budgets (enforced in CI and RUM)
- First load of the app shell: under 1.5 s to interactive on a typical laptop; JS under 200 KB gzipped for the initial route
- Navigation between routes once cached: under 100 ms
- Edits (optimistic): shown in under 50 ms
- API p95 under 200 ms; grid of 1,000 items scrolls at 60 fps
- Share link opening on a 4G phone: LCP (largest contentful paint) under 1.5 s

### 9.2 Cache layers
| Layer | What | How it's invalidated |
|---|---|---|
| Browser: query cache | All entities fetched, persisted to IndexedDB | Show cached data then refresh in the background; SSE pushes invalidations by ID. Cleared on logout or role change. |
| Browser: prefetch | Route loaders, plus hover or focus on project links | Same as above |
| Browser: service worker | App shell and hashed static assets | Cached permanently by file hash |
| CDN | Static assets, transformed images, share pages | Images by hash; share pages purged when the document version changes |
| Server: Redis | Project summaries, dashboard counts, report results | Keys include `studio:{id}:v{version}` so any write bumps the version |
| Database | Summary tables (project totals, PO status counts) updated in the same transaction as the write | Always consistent |
| Generated files | PDFs keyed by a hash of document version, branding and audience | Regenerated only when the hash changes |

### 9.3 Cache safety rules
- Cache keys **must** include `studio_id` and the **permission set** (or audience scope for links). Responses with cost data are never shared between permission sets.
- Share-page HTML at the CDN is keyed by link token and version. A revoked link purges it, and `Cache-Control: private` is set wherever cost-sensitive data could appear.
- Automated tests check that every serializer used for a client or vendor view drops the forbidden fields.

---

## 10. Integrations

| Integration | MVP behavior | Notes |
|---|---|---|
| QuickBooks Online | OAuth connection. One-way sync **out** to QBO for customers, vendors, invoices, payments, bills and items/services (as summary income accounts). Payment status is read back. | QBO owns the ledger. We map accounts once at setup. Sync is idempotent and keyed by our ID, with a sync log and a way to re-sync. |
| Stripe Connect | Studio onboarding; card and ACH; deposits; refunds; webhooks recorded as Payments | See section 11 |
| Postmark | Outbound document email, open tracking | Sent from the studio's own address after domain verification (DKIM/SPF) |
| Clipper | Captures product data into an item | The source URL is stored, and the price is flagged for review |
| Design tools | Links, embeds and image import from Canva, SketchUp, DesignFiles boards and Pinterest | Mapped to v1.1 |
| CSV import | Vendors, clients, items | Column mapping UI and a dry-run preview |

---

## 11. Payments compliance

Processing payments means the following areas have to be handled:

1. **PCI DSS (card data security).** Card numbers must never touch our servers. Stripe Elements or Checkout tokenizes the card in Stripe's iframe, which keeps us at the lightest compliance level (**SAQ A**). Rules: no logging card data and no custom card fields.
2. **Money transmission.** If we hold or move money *between* parties, we could become a money transmitter, which requires state licenses. With **Stripe Connect**, each studio is its own merchant of record and funds go to the studio's Stripe account. We never hold the funds. This is the main reason to use Connect.
3. **KYC / onboarding.** Studios must verify their identity and business (EIN, bank account, owner identity). Stripe's hosted onboarding handles this. We show the account status and block payment features until the studio is verified.
4. **Tax forms.** Stripe issues the 1099-K forms for connected accounts. We set up which party is responsible for them during the Connect setup.
5. **Passing card fees to the client.** Many designers want to add about 3% for cards on large deposits. Card networks cap surcharges, require disclosure and notice, and do not allow surcharges on debit cards. **A few states restrict or ban surcharging, and the rules change.** Approach: a studio setting off by default, a disclosure on the payment page, and a check by state, plus "ACH is free" messaging, which is often easier anyway. Confirm current rules with counsel before launch.
6. **ACH.** It requires authorization from the payer under the NACHA rules. Stripe's ACH flow records it. ACH has return windows of several days, so a deposit isn't confirmed immediately. The UI should say **"processing"** and not "paid" until it settles.
7. **Disputes and refunds.** Large deposits on custom work are a chargeback risk. Store the signed proposal, approval records and terms, which non-refundable custom-order clauses depend on, as evidence for disputes.
8. **Platform terms.** Terms of service and a privacy policy, plus a data processing agreement (DPA) for studios that ask. SOC 2 can wait until firms of 10–50 start requesting it.

---

## 12. Suggested pricing

Principles: **no modules** (unlike DesignSmart), outside parties are free, and the price shouldn't penalize a solo studio for hiring its first assistant.

| Plan | Price (monthly; annual ≈ 2 months free) | Seats | Notes |
|---|---|---|---|
| **Solo** | $59 | 1 | Every feature, unlimited projects and share links |
| **Studio** | $149 | Up to 5 | Adds roles and cost-hiding, warehouse receiving |
| **Studio Plus** | $279 | Up to 10 | Adds PO approvals and advanced reports; +$29 per extra seat |

- **Payments:** pass Stripe's fees through at cost, with **no platform fee at launch** as a selling point against competitors that take a cut. Revisit later with an optional small fee for instant payouts.
- 14-day trial with no card required, plus free white-glove migration for annual plans. Migration is the biggest barrier to switching.
- A founding-studio discount for the first 50 studios in exchange for feedback calls.

---

## 13. Build milestones

Each milestone ends with something beta studios can use, and has to meet its exit criteria before the next one starts.

| # | Milestone | Contents | Exit criteria |
|---|---|---|---|
| M0 | **Foundations** | Monorepo, CI, auth, studios and invitations, roles, RLS, design system (tokens, grid, forms, command palette), performance budgets in CI, SSE invalidation, audit log, deploy pipeline | A user can sign up, create a studio and invite a member. The empty app shell meets its budgets. |
| M1 | **Catalog** | Clients, vendors (categories, filters), projects, rooms, items, components, images, pricing engine plus fixture tests, Chrome clipper v1, CSV import | Clip to an item in under 10 s. Pricing tests pass for markup, margin, MSRP, COM, tax and freight cases. |
| M2 | **Proposals and payments** | Proposal versions, branded PDF, client share link, approve or reject per line, e-sign, Stripe Connect onboarding, deposit payments (card and ACH), cost-hiding serializer tests | A real client approves and pays a deposit end to end in Stripe test mode. No cost field leaks (automated tests). |
| M3 | **Procurement** | Generate POs by vendor, PO PDF and email, vendor share link (acknowledge, ship date, tracking, invoice upload), procurement board, follow-up automations, receiving and damage, vendor deposits and bills | The COM sofa produces 2 correct POs and its status rolls up from both. |
| M4 | **Time and billing** | Timer and manual time, rates, flat and hourly fees, reimbursables, invoices, retainers, QBO connection and sync | Invoices, payments and bills appear correctly in a QBO sandbox. Re-syncing creates no duplicates. |
| M5 | **Schedules and approvals** | Schedule types, automatic tag codes, issued revisions with changes marked, contractor link, PDF; the Approvals feature blocking orders | The contractor link shows the latest revision with marked changes on a phone. |
| M6 | **Project flow** | Phases (Consultation, Schematic, Design Development, Construction Administration), tasks linked to items, templates, "My day" dashboard, project health view | A new project from a template is ready in under 1 minute. Item events create and close tasks. |
| M7 | **Beta hardening** | DesignSmart and Programa import mappings, profit-per-project report, accessibility pass, load tests, security review, onboarding checklist | 5 beta studios run real projects for 4 weeks. Performance budgets hold in RUM. |

M2 comes before M3 because the proposal-to-deposit path is what studios pay for first, and it brings in real data that procurement needs.

---

## 14. Risks and how to reduce them

| Risk | Mitigation |
|---|---|
| Pricing or tax math errors damage trust | One pure pricing function, a large set of fixture cases, and reviewing totals against spreadsheets from beta studios |
| Duplicate or broken QBO syncs | Idempotency keys, a visible sync log, sandbox tests, and syncing summaries rather than every detail |
| Cost data leaking to clients | Serializers per audience, cache keys that include permissions, automated tests that fail on forbidden fields |
| Clipper breaking when vendor sites change | Structured-data first, parsers for the top 30 vendors, manual fallback, and monitoring of clip failures |
| Migration friction blocks sales | Build import early in M1 and add more mappings in M7, plus assisted migration |
| Feature creep from requests by larger firms | Section 4 scope stays fixed for the MVP; requests go to v1.1 or v2 |

---

## 15. Still open (decide before the milestone listed)

1. **Product name and domain.** Named **Coord** (Oct 27, 2026). Domain still to pick.
2. **Which accounting platforms at launch:** QBO only (recommended), or QBO Desktop too? Desktop needs a separate sync connector. Before M4.
3. **Sales-tax calculation:** rates entered by the studio (MVP) or automated (Stripe Tax or Avalara). Automated costs money per transaction. Before M2.
4. **Which states to verify surcharging rules for first:** the states the beta studios are in. Before M2.
5. **Beta studios:** recruit 5, ideally 3 solo and 2 with 4–10 people, current DesignSmart or spreadsheet users. Before M1 ends.
6. **E-sign:** is the built-in click-to-sign enough, or do studios expect DocuSign? Ask beta studios. Before M2.
7. **Fee types:** confirm that flat fee plus hourly covers most beta studios before deferring cost-plus. Before M4.
