# Coord: Build Plan

This is the top-down plan to settle before writing code. Each section either records a decision or lists what still needs to be decided. Build milestones are in section 13.

---

## 1. Decisions already made

| # | Decision | What it means for the build |
|---|---|---|
| D1 | **The accounting system is the source of truth for the books.** We don't build accounting. | We own items, contracts, procurement proposals, POs, time and invoices as *documents*. Invoices, payments and bills sync to QuickBooks Online (QBO), which owns the ledger, tax filing and the P&L. No general ledger, bank reconciliation or payroll. |
| D2 | **No formal submittals.** | Replaced by a light **Approvals** feature (see 6.6) covering shop drawings and slab or sample approvals. CFAs (cuttings for approval) are part of procurement (see 6.3). |
| D3 | **US only.** | USD only, US sales-tax model, US date and number formats. Money is stored in integer cents with a currency column (always USD for now) so other currencies can be added later. |
| D4 | **We process client payments** through Stripe Connect. | See section 11 for compliance. |
| D5 | **Receiving and warehouses are in scope.** | Receiving locations, receiving records, damage tracking. Full inventory accounting is out of scope. |
| D6 | **Outside parties use secure share links.** | No client, vendor or contractor accounts. Links are signed and revocable. Actions that need accountability (approve, pay, sign) are verified with an email code. |
| D7 | **Target 1–10 person studios.** Must clearly beat DesignSmart. | Simple defaults, nothing gated behind add-on modules, and depth that can be turned on as needed rather than shown up front. |
| D8 | **Integrate with design tools rather than building them.** | Mood boards and floor plans are links and embeds, plus image import. We build only the product clipper. |
| D9 | **Local-first is optional.** | Build in this order: a cache stored in the browser, optimistic updates, real-time invalidation. Keep the data layer swappable for a sync engine later. |
| D10 | **Client onboarding and procurement are separate.** (Nov 5, 2026) | Studios say "proposal" loosely, sometimes meaning the whole process of establishing a new client. In Coord, **client onboarding** means sending a new client the studio's contract to sign. A **procurement proposal** means priced furniture and materials for a client to approve, and any other "proposal" in this plan means one of these. |
| D11 | **Contracts are the studio's own documents.** | Every studio's contract is different, so we don't standardize or write them, and Coord gives no legal advice. A studio uploads its own PDF and chooses the fields that change, then fills in those fields for each new client. |

### What DesignSmart has (the baseline to beat)
According to its public listings: proposals, invoices, purchase orders, time tracking, QuickBooks integration, task reminders, an image library and card payments. It runs on the web or on-premise, starts at about $52 per month, and its modules are sold separately. ([Capterra listing](https://www.capterra.com/p/192463/DesignSmart/))
**How we win:** everything is included with no modules, a modern fast UX, a clipper, a client portal through share links, tracking after the PO, schedules, and COM handling.

---

## 2. Product principles (used to break ties)

1. **Speed is a feature.** Every screen after the first renders from cache in under 100 ms. Every edit shows up immediately and saves in the background.
2. **Enter it once, use it everywhere.** An item is entered one time and then feeds the procurement proposal, the POs, the schedule, the budget and the tasks.
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
| Upload the studio's own contract once, and reuse it for each client by editing a few fields | M |
| Add a new client, fill in the contract, and send it to sign and pay any deposit | M |
| Create a project from a template (phases and tasks) in under a minute | M |
| Clip products from vendor sites into a project room | M |
| Save favorite products (sofas, lamps, fabrics) to a studio product library and pull them into any project | L |
| Generate a procurement proposal by room, with pricing and freight, send it as a link, client approves and pays in full online | M |
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
| Set studio defaults: markup, whether to charge a deposit and at what %, fee type, payment terms | M |

### 3.3 Jordan, senior designer / PM
| Use case | Pri |
|---|---|
| One project view showing phase, tasks, items awaiting approval and late orders | M |
| Revise a procurement proposal after the client changes their mind, with version history kept | M |
| Approve a fabric CFA against her memo sample before the vendor cuts and ships |
| Send approval requests (shop drawings, samples) to the client or herself | M |
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
| Client | Open the contract from a link, e-sign it and pay any deposit | M |
| Client | View the procurement proposal, approve or reject each item, comment, e-sign, pay by card or ACH | M |
| Client | See a simple project status page (phase, upcoming milestones) | L |
| Vendor | View the PO, acknowledge it, enter the ship date and tracking, upload an invoice | M |
| Contractor | View the latest schedule on a phone, see what changed, download a PDF | M |

---

## 4. Scope

### MVP: the "replace DesignSmart" release
- Studios, users, roles, invitations
- Clients and contacts; vendors with categories and filters
- Client onboarding: a reusable contract the studio uploads, with editable fields, e-sign on Coord, an optional deposit, and hours on the project with a marker for when billing passes the deposit (see 6.9)
- Projects, rooms, phases, tasks (including tasks linked to items) and project templates
- Items: clipper, images, the pricing engine, COM components
- Procurement proposals for furniture and materials: generated from items with pricing and freight; versions, share link, approve or reject, e-sign, payment in full
- POs: generated from approved items, one per vendor; email or share link; vendor acknowledgment
- Order tracking and receiving, including the warehouse
- Schedules: lighting, plumbing, finishes, paint, hardware, custom; tag codes; revisions; contractor link; PDF
- Approvals (the submittals-lite feature)
- Time tracking (timer and manual), billable by default with a non-billable option, hourly and flat fee billing
- Studio setup questions that decide how the studio charges and how its invoices are generated (see 6.10)
- Invoices: billable time, flat fees and reimbursables as the studio chooses, plus product changes such as freight adjustments, with any deposit applied; Stripe payments
- QBO sync: customers, invoices, payments, vendors, bills
- Branded PDFs for procurement proposals, POs, invoices and schedules (contracts keep the studio's own PDF layout)
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
- Lead pipeline
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
        ├─ ContractTemplate ─ TemplateVersion (the uploaded PDF) ─ ContractField (page, position, type, label, default)
        └─ Project ─┬─ Room
                    ├─ Phase ─ Task (→ optional Item link)
                    ├─ Item ─┬─ ItemComponent (main piece, COM fabric, trim, freight…)
                    │        ├─ ItemImage, ItemAttachment
                    │        ├─ Approval (shop drawing, sample)
                    │        └─ ScheduleEntry (optional, one per schedule)
                    ├─ Contract ─ ContractVersion (→ TemplateVersion; field values, frozen PDF, signature)
                    ├─ ProcurementProposal ─ ProposalVersion ─ ProposalLine (snapshot of Item pricing)
                    ├─ PurchaseOrder ─ POLine (→ ItemComponent) ─ Shipment ─ ReceivingRecord
                    ├─ Schedule ─ ScheduleRevision (issued snapshot)
                    ├─ Invoice ─ InvoiceLine (time | fee | reimbursable | product-adjustment | deposit-applied)
                    ├─ Payment (client → studio, via Stripe or recorded manually)
                    ├─ VendorDeposit / VendorBill (studio → vendor, synced to QBO)
                    ├─ Expense (reimbursable)
                    └─ ShareLink (→ any shareable document version)
```

### Key modeling rules
1. **Item is the central record.** Proposal lines, PO lines and schedule entries all reference it. Procurement proposals and issued schedules store **snapshots**, so a later edit never silently changes a document that was already sent. Contract versions are frozen the same way.
2. **COM and multi-vendor items.** An `Item` has one or more `ItemComponent`s, each with its own vendor and cost. *Custom sofa = frame and labor (Workroom A) + 14 yd fabric (Fabric House B, ship to Workroom A).* The client sees **one line**. Generating POs produces **one PO per vendor**, and each component records its ship-to address, which can be another vendor.
3. **An item is procured, specified or both.** `procured`: goes on the procurement proposal and a PO. `specified`: goes on a schedule and the contractor buys it. One sconce can be both, entered once.
4. **Pricing engine** (one pure function on the server, unit-tested):
   - Each component: `net_cost × qty`, plus freight, crating, receiving and install charges
   - Client price by mode: **markup** `cost × (1 + m)`, **margin** `cost ÷ (1 − g)`, **MSRP minus discount**, or a **fixed** price
   - Tax applies to the charge types the project marks taxable (states differ on taxing freight and install). Exempt clients have $0 tax and a certificate on file.
   - Procurement proposals have no deposit; the client pays 100% of approved lines. Only the contract can have a deposit (6.9)
   - Rounding: compute in cents and round at the line level, using one documented rule everywhere
5. **Status rules** live in code, not in free-form status fields:
   - Item procurement: `draft → proposed → approved | rejected → paid → ordered → acknowledged → in_production → shipped → received → delivered → installed → closed`, with side branches `backordered`, `damaged`, `cancelled`
   - An item's status is **calculated** from its components' PO lines: the item is only as far along as its slowest component
   - Contract: `draft → sent → signed | declined | superseded`
   - Procurement proposal: `draft → sent → partially_approved → approved → superseded`
   - PO: `draft → sent → acknowledged → partially_received → received → closed | cancelled`
6. **Multi-tenancy:** every row has a `studio_id`. Postgres row-level security (RLS) is a second line of defense behind checks in the application code.
7. **Audit log** for anything involving money or approvals: who did what, when, with values before and after.

---

## 6. Core workflows (end to end)

6.1 **Sourcing:** clip, choose the project and room, the app guesses vendor, price and dimensions, the user confirms, the item is added as a draft.
6.2 **Procurement proposal to payment:** select furniture and material items, generate a proposal version with pricing and freight, send the share link, the client approves lines (email code), e-signs and pays 100% of the approved lines. Items move to `paid`, a payment is recorded and synced to QBO, and a task "Order approved items" is created.
6.3 **Order:** nothing is ordered until the client has paid. "Generate POs" groups the paid components by vendor. The studio reviews, then sends by email with a PDF and vendor link. The vendor acknowledges and enters a ship date. For fabric, the vendor sends a **CFA** (cutting for approval): a cutting from the current dye lot. The designer compares it with her memo sample and approves or rejects it on the PO line, and the fabric isn't cut or shipped until it is approved. A COM fabric PO ships to the workroom named on its component. A vendor deposit is recorded and the bill syncs to QBO.
6.4 **Tracking:** an automatic follow-up task appears if a PO is unacknowledged after N days or past its ship date. The procurement board shows everything by status.
6.5 **Receiving:** the warehouse or studio records a receipt with photos. Damage leads to a claim and a task. Delivery and install close out the item.
6.6 **Approvals (submittals-lite):** attach a shop drawing, sample or slab photo to an item. Request approval from the client (link) or a designer (internally). Outcome is `approved`, `approved as noted` or `revise and resubmit`. The item can't be ordered until required approvals clear.
6.7 **Schedules:** add specified items to the lighting or plumbing schedule. Tag codes such as L-1 are suggested automatically and stay editable, so they can match the tags on the designer's floor plan. "Issue revision" freezes a snapshot. The contractor link always shows the latest revision with changes marked, and a PDF is generated.
6.8 **Billing:** what goes on an invoice follows the studio's setup answers (6.10): billable time, flat fees and reimbursables where the studio uses them, and product changes, such as a freight adjustment when freight came in above or below the proposal. Any deposit is applied to billable time only. Send the link, the client pays, and it syncs to QBO.
6.9 **Client onboarding:** added with the lead designer on Nov 3, 2026. The money rules are in `docs/money-policy.md` section 5. The decisions still needed are items 9 to 11 in section 15.

1. **Add the client.** A designer, or anyone else allowed to add clients, creates the client and their project.
2. **Fill in the contract.** Every studio uploads its own contract once and reuses it for each client. Studios sometimes call this document their "proposal"; Coord calls it the contract (D10). The studio marks where the editable fields go on the page, including the signature. For each project, the designer edits those fields and Coord adds the values to a copy of the contract. Text outside the fields can't be edited in Coord, and changing it means uploading a new contract. A field can cover printed text, but that text stays in the file, so studios should upload a blank contract, not another client's copy. A new upload never changes a contract already sent. The contract covers design time only. Furniture and materials go on a separate procurement proposal that Coord generates from the project's items and is sent later (6.2), and some projects never have one.
3. **Calculate the deposit.** The designer enters the hourly rate and projected hours, and Coord calculates `hourly rate × projected hours × deposit %`. Fields for the client's name, rate, hours and deposit are filled from Coord's own data, so the contract shows the same numbers Coord charges. The rate is the only rate charged on the project. The deposit percentage comes from a studio-wide setting that defaults to **50%**. A 60-hour project at $150/h has a **$4,500** deposit.
4. **Send and sign.** The client receives a share link (D6), reads the contract on Coord and signs there with the built-in e-sign, with no account needed. Coord keeps the filled-in copy, its hash, and a record of the signature, and that copy can't be edited once sent.
5. **Pay, if applicable.** Signing takes the client straight to paying the deposit through Stripe. Coord treats a deposit, down payment or retainer as the same thing. ACH shows as "processing" until it settles (section 11.6).
6. **Show hours on the project.** The design team sees total, billable and non-billable hours. All time is billable unless someone marks it non-billable. Clients never see this view, and it is left out of every share page.
7. **Show the hours the deposit covers.** Once the payment succeeds, the project also shows how many billable hours the deposit covers, which is `projected hours × deposit %`. The 60-hour project above reads "12 of 30 deposit hours used". Billable time uses up the deposit first, and non-billable time doesn't count.
8. **Mark when billing starts.** Past that point the project shows a plain marker, such as "Past the deposit: 5 h billable". This view shows hours, not dollars. Actual billing goes through 6.8, with the deposit applied.
9. **Refund what's left.** If the project closes before the deposit is used up, the client is refunded the balance through Stripe.

**The deposit is optional.** Each studio chooses whether it charges one, and Coord doesn't assume it does. A studio that charges deposits can still skip one on a single contract. Steps 5, 7, 8 and 9 and the deposit calculation in step 3 apply only when there is a deposit. Without one, the designer still enters the hourly rate, signing finishes onboarding with no payment step, and the project just shows hours worked. All billable time is billed by invoice from the first hour.

6.10 **Studio setup:** when a studio joins Coord, it answers a few questions about how it charges, and Coord generates invoices from the answers. The questions are how it charges for design work (hourly, flat fee or both), whether it charges a deposit and at what %, and whether it bills reimbursable expenses back to clients. A studio can change its answers later in settings. A change never alters an invoice or contract already sent.


### Submittals compared with designer approvals
In commercial construction a *submittal* is the contractor formally submitting shop drawings, product data and samples to the architect or designer for approval, tracked in a numbered log. Residential designers don't keep that log, but they make the **same kind of approval decisions** constantly: upholstery and millwork shop drawings from workrooms, stone slab selection, paint drawdowns, tile samples, lighting cut sheets. Fabric CFAs are similar but happen after the order is placed, so they live in procurement (6.3). The **Approvals** feature covers this, and it can block an order until approval is given, which prevents costly reorders. A formal log can be added later if commercial users need one.

---

## 7. Permissions

| Role | Sees cost and markup | Edits pricing | Sends documents | Payments and QBO | Studio settings |
|---|---|---|---|---|---|
| Owner | ✔ | ✔ | ✔ | ✔ | ✔ |
| Admin / Manager | ✔ | ✔ | ✔ | ✔ | Limited |
| Designer | Configurable | Configurable | ✔ | ✗ | ✗ |
| Assistant | ✗ | ✗ | Configurable | ✗ | ✗ |
| Bookkeeper | ✔ | ✗ | Invoices only | ✔ | ✗ |

- Adding clients and starting onboarding (6.9) is its own permission, on by default for Owner, Admin / Manager and Designer. Sending the client a payment link doesn't give a Designer access to payments or QBO.
- The server shapes each response by **field-level permission set** (for example `can_view_cost`). Cache keys include that permission set (see 9.3).
- Share links have a fixed **audience scope** (`client`, `vendor` or `contractor`), and each scope has a hard-coded list of allowed fields. A vendor link shows cost and **never** client price. A client link shows client price and **never** cost.

---

## 8. Architecture and stack

Where this section and `docs/rebuild-plan.md` differ, the rebuild plan wins.

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
- **Server cache:** off on Vercel, because instances don't share memory. The browser cache does most of the work. A server cache is added only when a measured endpoint needs one.

| Layer | Choice | Why |
|---|---|---|
| Language | TypeScript across the whole stack, npm workspaces monorepo | Types shared between client, server and PDF templates |
| Web app | React + Vite SPA, TanStack Router, TanStack Query, TanStack Table with virtualization | App-like speed, loaders that prefetch per route, a fast grid |
| Share pages | Server-rendered by the API (lightweight HTML, very little JS), never cached at the edge | Clients open links on phones and need the first view to be instant |
| API | Hono on Node, zod-validated typed routes (or tRPC) | Fast, simple, runs on the edge or on Node |
| Database | Postgres (Neon or Supabase) + Drizzle ORM; `pg_trgm` and full-text search for search | One datastore, RLS, adequate search for the MVP |
| Jobs | A Postgres outbox delivered by a queue (Cloudflare Queues in the rebuild plan) | No extra datastore |
| Files / images | Cloudflare R2 + Cloudflare Images (or imgproxy) | Cheap storage and on-the-fly AVIF and WebP |
| PDFs | Same React components rendered to HTML, then Playwright/Chromium in a worker | One template system for screen and PDF |
| Contract PDFs | Show the studio's PDF in the browser to place fields; write the values onto a copy of it on the server | The studio's layout stays intact. Libraries are vetted in the first contract brief (section 15, item 9). |
| Real-time | Server-Sent Events channel per studio that pushes entity invalidations | Simple and fits through proxies |
| Auth | Better Auth (organizations, invitations, passkeys) or WorkOS | Multi-tenant, with SSO possible later |
| Email | Postmark for transactional and outbound documents; inbound parsing later | Reliable delivery for POs and invoices |
| Payments | Stripe Connect (Express or Standard) + Stripe Elements / Checkout | See section 11 |
| E-sign | Built-in click-to-sign (typed name, timestamp, IP, document hash) for the MVP, on Coord's own documents and on contracts studios upload; Dropbox Sign or DocuSign later if needed | ESIGN Act–compliant for contracts and procurement proposals |
| Clipper | Chrome extension (Manifest V3); Safari later | Reads schema.org/Open Graph data, with parsers per vendor site for the top vendors |
| Hosting | API and workers on Fly.io or Render; static assets and the CDN on Cloudflare | Simple operations at this stage |
| Observability | Sentry, with client data scrubbed. OpenTelemetry and real-user monitoring wait until beta traffic needs them | Enough to find errors without another system |

**Leaving room for local-first:** all reads go through TanStack Query keyed by normalized entity IDs, and all writes go through a single mutation layer. Moving to a sync engine (Zero, Replicache or ElectricSQL) later replaces that layer, not the screens.

---

## 9. Performance and caching

### 9.1 Budgets (enforced in CI)
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
| CDN | Static assets and transformed images | Cached permanently by file hash |
| Generated files | PDFs keyed by a hash of document version, branding and audience | Regenerated only when the hash changes |

Not built until a measurement shows the need: a server cache (Redis), summary tables, a service worker. Totals and counts are computed with indexed queries.

### 9.3 Cache safety rules
- Cache keys **must** include `studio_id` and the **permission set** (or audience scope for links). Responses with cost data are never shared between permission sets.
- Share pages are never cached at the CDN. They are sent with `Cache-Control: private, no-store`, so a revoked link stops working at once and no client data sits in a shared cache.
- Automated tests check that every serializer used for a client or vendor view drops the forbidden fields.

---

## 10. Integrations

| Integration | MVP behavior | Notes |
|---|---|---|
| QuickBooks Online | OAuth connection. One-way sync **out** to QBO for customers, vendors, invoices, payments, bills and items/services (as summary income accounts). Payment status is read back. | QBO owns the ledger. We map accounts once at setup. Sync is idempotent and keyed by our ID, with a sync log and a way to re-sync. |
| Stripe Connect | Studio account setup; card and ACH; deposits; refunds; webhooks recorded as Payments | See section 11 |
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
5. **Passing card fees to the client.** Many designers want to add about 3% for cards on large payments. Card networks cap surcharges, require disclosure and notice, and do not allow surcharges on debit cards. **A few states restrict or ban surcharging, and the rules change.** Approach: a studio setting off by default, a disclosure on the payment page, and a check by state, plus "ACH is free" messaging, which is often easier anyway. Confirm current rules with counsel before launch.
6. **ACH.** It requires authorization from the payer under the NACHA rules. Stripe's ACH flow records it. ACH has return windows of several days, so a payment isn't confirmed immediately. The UI should say **"processing"** and not "paid" until it settles.
7. **Disputes and refunds.** Large payments on custom work are a chargeback risk. Store the signed contract, signed procurement proposal, approval records and terms, which non-refundable custom-order clauses depend on, as evidence for disputes.
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
| M2 | **Client onboarding and payments** | Contract upload, field placement, values per project, deposit calculation, frozen contract PDF, client share link, e-sign, Stripe Connect setup, deposit payments (card and ACH), refunds and reconciliation | A real client signs a contract made from a studio's own PDF and pays the deposit end to end in Stripe test mode. Every value on the signed copy matches Coord's data. |
| M3 | **Procurement** | Procurement proposals (generated from items with pricing and freight, versions, branded PDF, client share link, approve or reject per line, e-sign, payment in full), cost-hiding serializer tests, generate POs by vendor, PO PDF and email, vendor share link (acknowledge, ship date, tracking, invoice upload, CFA), procurement board, follow-up automations, receiving and damage, vendor deposits and bills | A real client approves a proposal and pays in full in Stripe test mode. No cost field leaks (automated tests). The COM sofa produces 2 correct POs and its status rolls up from both. |
| M4 | **Time and billing** | Timer and manual time, rates, flat and hourly fees, reimbursables, invoices, retainers, QBO connection and sync | Invoices, payments and bills appear correctly in a QBO sandbox. Re-syncing creates no duplicates. |
| M5 | **Schedules and approvals** | Schedule types, suggested and editable tag codes, issued revisions with changes marked, contractor link, PDF; the Approvals feature blocking orders | The contractor link shows the latest revision with marked changes on a phone. |
| M6 | **Project flow** | Phases (Consultation, Schematic, Design Development, Construction Administration), tasks linked to items, templates, "My day" dashboard, project health view | A new project from a template is ready in under 1 minute. Item events create and close tasks. |
| M7 | **Beta hardening** | DesignSmart and Programa import mappings, profit-per-project report, accessibility pass, load tests, security review, studio setup checklist | 5 beta studios run real projects for 4 weeks. Performance budgets hold for the beta studios. |

M2 comes before M3 because the contract and its deposit are the first things a new client sees, and a project can have them without ever having a procurement proposal. Building payments in M2 also gives procurement proposals a checkout to reuse in M3.

---

## 14. Risks and how to reduce them

| Risk | Mitigation |
|---|---|
| Pricing or tax math errors damage trust | One pure pricing function, a large set of fixture cases, and reviewing totals against spreadsheets from beta studios |
| Duplicate or broken QBO syncs | Idempotency keys, a visible sync log, sandbox tests, and syncing summaries rather than every detail |
| Cost data leaking to clients | Serializers per audience, cache keys that include permissions, automated tests that fail on forbidden fields |
| Clipper breaking when vendor sites change | Structured-data first, parsers for the top 30 vendors, manual fallback, and monitoring of clip failures |
| Uploaded contract PDFs vary (scans, rotated pages, odd sizes, password protection) | Test with real contracts from beta studios, preview before sending, and refuse files we can't write to, with a clear message |
| Migration friction blocks sales | Build import early in M1 and add more mappings in M7, plus assisted migration |
| Feature creep from requests by larger firms | Section 4 scope stays fixed for the MVP; requests go to v1.1 or v2 |

---

## 15. Still open (decide before the milestone listed)

1. **Product name and domain.** Named **Coord** (Oct 27, 2026). Domain still to pick.
2. **Which accounting platforms at launch:** QBO only (recommended), or QBO Desktop too? Desktop needs a separate sync connector. Before M4.
3. **Sales-tax calculation:** rates entered by the studio (MVP) or automated (Stripe Tax or Avalara). Automated costs money per transaction. **The legacy M2 build used studio-entered rates per project**; revisit automation after beta.
4. **Which states to verify surcharging rules for first:** the states the beta studios are in. **The legacy M2 build had no card surcharge** (the default-off setting from section 11.5); the payment page says ACH is free instead. Add the setting once counsel confirms the beta studios' states.
5. **Beta studios:** recruit 5, ideally 3 solo and 2 with 4–10 people, current DesignSmart or spreadsheet users. Before M1 ends.
6. **E-sign:** is the built-in click-to-sign enough, or do studios expect DocuSign? Ask beta studios. **The legacy M2 build used the built-in click-to-sign** (typed name, verified email, time, IP, document hash); still ask beta studios.
7. **Fee types:** confirm that flat fee plus hourly covers most beta studios before deferring cost-plus. Before M4.
8. **Procurement proposal PDF:** in the legacy M2 build, the client page doubled as the printable document (print or save as PDF from the browser). Server-rendered PDF files for attachments (section 8, Playwright worker) are still to build, likely alongside PO PDFs in M3.
9. **Uploaded contract (6.9):** placing fields on a PDF is the chosen approach; test it against real studio contracts. Vet the libraries under the dependency rule. As of Nov 5, 2026: `pdfjs-dist` (Mozilla, Apache-2.0) looks fine for showing pages. `pdf-lib` has no npm activity since 2022, so it fails. Its fork `@cantoo/pdf-lib` (MIT) is active and is the candidate for writing values. `mupdf` is active but AGPL, so its license needs a decision. Have counsel review the signing flow before launch. Before the onboarding brief.
10. **Deposits on flat-fee work (6.9, 6.10):** the deposit formula and the "past the deposit" marker are based on hours. Proposed for a flat-fee contract: the deposit is `flat fee × deposit %` and is applied to the fee on invoices, the project shows hours worked with no marker, and no unused balance is refunded because the fee is fixed. Also decide whether a flat fee can be billed in stages, and whether a studio answering "both" picks per contract. Before G3.
11. **Contract file types:** PDF only at launch is the default. Studios with Word contracts export to PDF first. Ask beta studios whether that's enough. Before the onboarding brief.
