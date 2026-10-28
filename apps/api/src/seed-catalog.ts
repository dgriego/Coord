// Sample clients, vendors, projects, rooms and items for `npm run seed`.
// Every company and person here is made up. Product images are the small
// illustrations in apps/web/public/samples.

import type { ItemStatus, ProjectColor, ProjectPhase, VendorCategory } from "@coord/shared";
import { and, eq } from "drizzle-orm";
import type { Database, Db } from "./db/client.ts";
import { clients, itemComponents, items, projects, proposalLines, proposals, proposalVersions, rooms, shareLinks, studios, vendors } from "./db/schema.ts";
import { DEV_LINK_SECRET, shareUrl, snapshotItems } from "./proposals/model.ts";

const img = (name: string) => `/samples/${name}.svg`;

interface VendorSeed {
  name: string;
  categories: VendorCategory[];
  city: string;
  state: string;
  website: string;
  repName: string;
  discountBps: number;
  leadTimeWeeks: number | null;
  paymentTerms: string;
}

const VENDORS: VendorSeed[] = [
  { name: "Ashby Upholstery", categories: ["upholstery", "workroom"], city: "High Point", state: "NC", website: "ashbyupholstery.example", repName: "Carla Mendez", discountBps: 0, leadTimeWeeks: 12, paymentTerms: "50% deposit, balance before ship" },
  { name: "Lowell Textiles", categories: ["fabric"], city: "New York", state: "NY", website: "lowelltextiles.example", repName: "Ben Ostrowski", discountBps: 4000, leadTimeWeeks: 2, paymentTerms: "Net 30" },
  { name: "Brightwell Lighting", categories: ["lighting"], city: "Dallas", state: "TX", website: "brightwell.example", repName: "Tasha Greene", discountBps: 3500, leadTimeWeeks: 6, paymentTerms: "Net 30" },
  { name: "Oak & Iron Casegoods", categories: ["casegoods"], city: "Grand Rapids", state: "MI", website: "oakandiron.example", repName: "Pete Lindqvist", discountBps: 4500, leadTimeWeeks: 14, paymentTerms: "50% deposit" },
  { name: "Meridian Rug Co.", categories: ["rugs"], city: "Atlanta", state: "GA", website: "meridianrug.example", repName: "Priyanka Rao", discountBps: 3000, leadTimeWeeks: 10, paymentTerms: "Net 30" },
  { name: "Stone & Field", categories: ["tile_stone"], city: "Austin", state: "TX", website: "stoneandfield.example", repName: "Luis Herrera", discountBps: 2500, leadTimeWeeks: 4, paymentTerms: "Due on order" },
  { name: "Clearwater Plumbing Supply", categories: ["plumbing", "hardware"], city: "Houston", state: "TX", website: "clearwatersupply.example", repName: "Dana Whitfield", discountBps: 2000, leadTimeWeeks: 3, paymentTerms: "Net 30" },
  { name: "Halden Drapery Workroom", categories: ["workroom", "window_treatments"], city: "Dallas", state: "TX", website: "", repName: "Marisol Ortega", discountBps: 0, leadTimeWeeks: 6, paymentTerms: "50% deposit" },
  { name: "Pemberton Paint", categories: ["paint"], city: "Chicago", state: "IL", website: "pembertonpaint.example", repName: "", discountBps: 1500, leadTimeWeeks: 0, paymentTerms: "Credit card" },
  { name: "Gilt Mirror Studio", categories: ["accessories", "art"], city: "Santa Fe", state: "NM", website: "giltmirror.example", repName: "June Abara", discountBps: 3000, leadTimeWeeks: 8, paymentTerms: "Net 30" },
  { name: "Sunline Outdoor", categories: ["outdoor"], city: "Scottsdale", state: "AZ", website: "sunlineoutdoor.example", repName: "Rick Fontaine", discountBps: 3500, leadTimeWeeks: 9, paymentTerms: "Net 30" },
  { name: "Wren Wallcoverings", categories: ["wallcovering"], city: "Philadelphia", state: "PA", website: "wrenwalls.example", repName: "Sophie Carter", discountBps: 3000, leadTimeWeeks: 5, paymentTerms: "Net 30" },
  { name: "Northbeam Hardware", categories: ["hardware"], city: "Portland", state: "OR", website: "northbeam.example", repName: "", discountBps: 2500, leadTimeWeeks: 3, paymentTerms: "Net 30" },
  { name: "Copperline Appliances", categories: ["appliances"], city: "Dallas", state: "TX", website: "copperline.example", repName: "Andre Mills", discountBps: 1200, leadTimeWeeks: 8, paymentTerms: "Due on order" },
];

const CLIENTS = [
  { name: "The Hendersons", email: "kate.henderson@mail.example", phone: "(214) 555-0142", address: "4410 Beverly Dr\nDallas, TX 75205", taxExempt: false },
  { name: "Dr. Amara Okafor", email: "amara@okafor.example", phone: "(214) 555-0188", address: "7 Turtle Creek Blvd #1802\nDallas, TX 75219", taxExempt: false },
  { name: "Bellweather Hospitality", email: "projects@bellweather.example", phone: "(512) 555-0101", address: "220 Congress Ave\nAustin, TX 78701", taxExempt: true },
  { name: "Marcus and Lee Tan", email: "marcus.tan@mail.example", phone: "(469) 555-0190", address: "1290 Oak Lawn Ave\nDallas, TX 75207", taxExempt: false },
  { name: "Ruth Calloway", email: "ruth.calloway@mail.example", phone: "(972) 555-0133", address: "56 Preston Hollow Ln\nDallas, TX 75230", taxExempt: false },
];

type Part = { vendor: string; desc: string; cost: number; qty?: number; freight?: number; crating?: number; receiving?: number; install?: number; shipTo?: string };
interface ItemSeed {
  name: string;
  room: string;
  image?: string;
  qty?: number;
  status?: ItemStatus;
  dims?: string;
  finish?: string;
  sku?: string;
  tag?: string;
  specified?: boolean;
  procured?: boolean;
  markup?: number;
  msrp?: number;
  parts: Part[];
}

interface ProjectSeed {
  name: string;
  client: string | null;
  color: ProjectColor;
  phase: ProjectPhase;
  status?: "active" | "on_hold" | "complete";
  address: string;
  budget: number | null;
  taxBps: number;
  daysAgo: number;
  rooms: string[];
  items: ItemSeed[];
}

const $ = (dollars: number) => Math.round(dollars * 100);

const PROJECTS: ProjectSeed[] = [
  {
    name: "Henderson Residence",
    client: "The Hendersons",
    color: "persimmon",
    phase: "design_development",
    address: "4410 Beverly Dr, Dallas, TX",
    budget: $(185_000),
    taxBps: 825,
    daysAgo: 1,
    rooms: ["Living Room", "Dining Room", "Primary Bedroom", "Primary Bath", "Entry"],
    items: [
      { name: "Custom sofa, tight back", room: "Living Room", image: "sofa", dims: '96"W x 38"D x 31"H', finish: "COM: Lowell Basketweave, Saffron", status: "approved", markup: 6000,
        parts: [
          { vendor: "Ashby Upholstery", desc: "Frame and labor", cost: 6200, freight: 450, install: 125, receiving: 85 },
          { vendor: "Lowell Textiles", desc: "Basketweave, Saffron (COM)", cost: 170, qty: 14, freight: 75, shipTo: "Ashby Upholstery" },
        ] },
      { name: "Pair of slipper chairs", room: "Living Room", image: "chair", qty: 2, dims: '27"W x 31"D x 30"H', finish: "Performance velvet, Fern", status: "proposed", markup: 5000,
        parts: [{ vendor: "Ashby Upholstery", desc: "Slipper chair, COM", cost: 1850, freight: 140 }, { vendor: "Lowell Textiles", desc: "Velvet, Fern (COM)", cost: 95, qty: 5, shipTo: "Ashby Upholstery" }] },
      { name: "Round cocktail table", room: "Living Room", image: "table", dims: '42" dia x 16"H', finish: "Cerused oak", status: "proposed", markup: 4000,
        parts: [{ vendor: "Oak & Iron Casegoods", desc: "Cocktail table", cost: 2100, freight: 180, crating: 95 }] },
      { name: "Hand-knotted wool rug", room: "Living Room", image: "rug", dims: "10' x 14'", finish: "Lagoon and ivory", status: "draft", markup: 3500,
        parts: [{ vendor: "Meridian Rug Co.", desc: "Custom size rug", cost: 7800, freight: 220 }] },
      { name: "Plaster table lamps", room: "Living Room", image: "lamp", qty: 2, status: "approved", markup: 4000,
        parts: [{ vendor: "Brightwell Lighting", desc: "Table lamp, plaster", cost: 640, freight: 45 }] },
      { name: "Drapery panels, pinch pleat", room: "Living Room", image: "drapery", qty: 4, finish: "Linen, Orchid", status: "draft", markup: 3500,
        parts: [{ vendor: "Halden Drapery Workroom", desc: "Fabrication and install", cost: 680, install: 90 }, { vendor: "Lowell Textiles", desc: "Linen, Orchid", cost: 88, qty: 9, shipTo: "Halden Drapery Workroom" }] },
      { name: "Dining chandelier", room: "Dining Room", image: "pendant", tag: "L-3", specified: true, status: "approved", markup: 4000,
        parts: [{ vendor: "Brightwell Lighting", desc: "Chandelier, 8 light, aged brass", cost: 3400, freight: 160, install: 350 }] },
      { name: "Extension dining table", room: "Dining Room", image: "table", dims: '96"-120"W x 44"D', finish: "Walnut", status: "proposed", markup: 4000,
        parts: [{ vendor: "Oak & Iron Casegoods", desc: "Dining table", cost: 5600, freight: 300, crating: 150 }] },
      { name: "Dining side chairs", room: "Dining Room", image: "chair", qty: 8, finish: "Leather, Cognac", status: "draft", markup: 4500,
        parts: [{ vendor: "Ashby Upholstery", desc: "Side chair", cost: 780, freight: 60 }] },
      { name: "Upholstered bed, king", room: "Primary Bedroom", image: "bed", dims: "King, 60\" headboard", finish: "Rosewater boucle", status: "proposed", markup: 5000,
        parts: [{ vendor: "Ashby Upholstery", desc: "Bed frame and headboard", cost: 3900, freight: 260, install: 150 }] },
      { name: "Nightstands", room: "Primary Bedroom", image: "table", qty: 2, finish: "Lacquer, Rosewater", status: "proposed", markup: 4000,
        parts: [{ vendor: "Oak & Iron Casegoods", desc: "Two-drawer nightstand", cost: 1250, freight: 90 }] },
      { name: "Bedside sconces", room: "Primary Bedroom", image: "sconce", qty: 2, tag: "L-5", specified: true, status: "approved", markup: 4000,
        parts: [{ vendor: "Brightwell Lighting", desc: "Swing-arm sconce", cost: 520, install: 120 }] },
      { name: "Vanity faucets", room: "Primary Bath", image: "faucet", qty: 2, tag: "P-1", specified: true, finish: "Polished nickel", status: "approved", markup: 2500,
        parts: [{ vendor: "Clearwater Plumbing Supply", desc: "Widespread faucet", cost: 690 }] },
      { name: "Zellige floor tile", room: "Primary Bath", image: "tile", qty: 140, tag: "T-1", specified: true, finish: "Citrine and fern", status: "proposed", markup: 2000,
        parts: [{ vendor: "Stone & Field", desc: "Zellige tile, per sq ft", cost: 28, freight: 2 }] },
      { name: "Arched mirror", room: "Entry", image: "mirror", dims: '36"W x 60"H', finish: "Water gilt", status: "draft", markup: 4500,
        parts: [{ vendor: "Gilt Mirror Studio", desc: "Arched mirror", cost: 2200, freight: 180, crating: 140, install: 150 }] },
      { name: "Entry walls", room: "Entry", image: "paint", tag: "PT-2", specified: true, procured: false, finish: "Eggshell, Fern Hollow", status: "approved", markup: 0,
        parts: [{ vendor: "Pemberton Paint", desc: "Paint color spec", cost: 0 }] },
    ],
  },
  {
    name: "Okafor Penthouse",
    client: "Dr. Amara Okafor",
    color: "cobalt",
    phase: "schematic",
    address: "7 Turtle Creek Blvd #1802, Dallas, TX",
    budget: $(120_000),
    taxBps: 825,
    daysAgo: 3,
    rooms: ["Living Room", "Kitchen", "Primary Bedroom", "Office"],
    items: [
      { name: "Modular sectional", room: "Living Room", image: "sofa", finish: "Bouclé, Snow", status: "draft", markup: 4500,
        parts: [{ vendor: "Ashby Upholstery", desc: "Sectional, 4 pieces", cost: 9800, freight: 600, install: 200 }] },
      { name: "Globe pendants", room: "Kitchen", image: "pendant", qty: 3, tag: "L-1", specified: true, status: "draft", markup: 4000,
        parts: [{ vendor: "Brightwell Lighting", desc: "Glass globe pendant", cost: 410, install: 110 }] },
      { name: "Desk", room: "Office", image: "table", finish: "Ebonized oak", status: "draft", markup: 4000,
        parts: [{ vendor: "Oak & Iron Casegoods", desc: "Writing desk", cost: 3100, freight: 200 }] },
      { name: "Silk rug", room: "Primary Bedroom", image: "rug", dims: "9' x 12'", status: "draft", markup: 3500,
        parts: [{ vendor: "Meridian Rug Co.", desc: "Silk and wool rug", cost: 6400, freight: 180 }] },
    ],
  },
  {
    name: "Bellweather Hotel Lobby",
    client: "Bellweather Hospitality",
    color: "lagoon",
    phase: "construction_admin",
    address: "220 Congress Ave, Austin, TX",
    budget: $(240_000),
    taxBps: 825,
    daysAgo: 6,
    rooms: ["Lobby", "Lounge", "Reception"],
    items: [
      { name: "Lounge chairs", room: "Lounge", image: "chair", qty: 12, finish: "Contract velvet, Lagoon", status: "ordered", markup: 3000,
        parts: [{ vendor: "Ashby Upholstery", desc: "Lounge chair", cost: 1450, freight: 95 }] },
      { name: "Reception desk", room: "Reception", image: "table", finish: "Fluted walnut", status: "ordered", markup: 3000,
        parts: [{ vendor: "Oak & Iron Casegoods", desc: "Custom reception desk", cost: 18500, freight: 900, crating: 600, install: 1200 }] },
      { name: "Statement chandelier", room: "Lobby", image: "pendant", tag: "L-1", specified: true, status: "received", markup: 3000,
        parts: [{ vendor: "Brightwell Lighting", desc: "Custom 4ft chandelier", cost: 14200, freight: 650, crating: 400, install: 1800 }] },
      { name: "Lobby rug", room: "Lobby", image: "rug", dims: "16' x 20'", status: "installed", markup: 2500,
        parts: [{ vendor: "Meridian Rug Co.", desc: "Hand-tufted, custom", cost: 15800, freight: 450 }] },
      { name: "Accent wall covering", room: "Lounge", image: "fabric", qty: 22, tag: "WC-1", specified: true, status: "installed", markup: 2500,
        parts: [{ vendor: "Wren Wallcoverings", desc: "Grasscloth, per roll", cost: 185, freight: 6 }] },
    ],
  },
  {
    name: "Tan Kitchen Refresh",
    client: "Marcus and Lee Tan",
    color: "marigold",
    phase: "consultation",
    address: "1290 Oak Lawn Ave, Dallas, TX",
    budget: $(45_000),
    taxBps: 825,
    daysAgo: 9,
    rooms: ["Kitchen", "Breakfast Nook"],
    items: [
      { name: "Counter stools", room: "Kitchen", image: "chair", qty: 3, finish: "Rattan and leather", status: "draft", markup: 3500,
        parts: [{ vendor: "Oak & Iron Casegoods", desc: "Counter stool", cost: 540, freight: 40 }] },
      { name: "Range", room: "Kitchen", image: "box", tag: "A-1", specified: true, status: "draft", markup: 1500,
        parts: [{ vendor: "Copperline Appliances", desc: '48" dual fuel range', cost: 9600, freight: 250, install: 300 }] },
    ],
  },
  {
    name: "Calloway Guest House",
    client: "Ruth Calloway",
    color: "fern",
    phase: "closed",
    status: "complete",
    address: "56 Preston Hollow Ln, Dallas, TX",
    budget: $(60_000),
    taxBps: 825,
    daysAgo: 40,
    rooms: ["Living Room", "Bedroom", "Patio"],
    items: [
      { name: "Sleeper sofa", room: "Living Room", image: "sofa", status: "installed", markup: 4000,
        parts: [{ vendor: "Ashby Upholstery", desc: "Queen sleeper", cost: 4200, freight: 300 }] },
      { name: "Outdoor dining set", room: "Patio", image: "table", status: "installed", markup: 3500,
        parts: [{ vendor: "Sunline Outdoor", desc: "Table and six chairs", cost: 5400, freight: 350, install: 150 }] },
      { name: "Bed linens", room: "Bedroom", image: "bed", status: "installed", markup: 3000,
        parts: [{ vendor: "Lowell Textiles", desc: "Linen bedding set", cost: 780 }] },
    ],
  },
];

const DAY = 24 * 60 * 60 * 1000;

export async function seedCatalog(sys: Db, studioId: string, small = false) {
  const vendorIds = new Map<string, string>();
  for (const v of small ? VENDORS.slice(0, 5) : VENDORS) {
    const [row] = await sys.insert(vendors).values({ ...v, website: v.website ? `https://${v.website}` : "", studioId }).returning({ id: vendors.id });
    vendorIds.set(v.name, row!.id);
  }
  const clientIds = new Map<string, string>();
  for (const c of small ? CLIENTS.slice(0, 1) : CLIENTS) {
    const [row] = await sys.insert(clients).values({ ...c, studioId }).returning({ id: clients.id });
    clientIds.set(c.name, row!.id);
  }

  for (const p of small ? PROJECTS.slice(1, 2) : PROJECTS) {
    const when = new Date(Date.now() - p.daysAgo * DAY);
    const [proj] = await sys
      .insert(projects)
      .values({
        studioId,
        name: p.name,
        clientId: p.client ? (clientIds.get(p.client) ?? null) : null,
        color: p.color,
        phase: p.phase,
        status: p.status ?? "active",
        address: p.address,
        budgetCents: p.budget,
        taxRateBps: p.taxBps,
        defaultMarkupBps: 4000,
        createdAt: new Date(when.getTime() - 30 * DAY),
        updatedAt: when,
      })
      .returning({ id: projects.id });
    const roomIds = new Map<string, string>();
    for (const [sort, name] of p.rooms.entries()) {
      const [r] = await sys.insert(rooms).values({ studioId, projectId: proj!.id, name, sort }).returning({ id: rooms.id });
      roomIds.set(name, r!.id);
    }
    for (const [sort, i] of p.items.entries()) {
      const [it] = await sys
        .insert(items)
        .values({
          studioId,
          projectId: proj!.id,
          roomId: roomIds.get(i.room) ?? null,
          name: i.name,
          qty: i.qty ?? 1,
          status: i.status ?? "draft",
          dimensions: i.dims ?? "",
          finish: i.finish ?? "",
          sku: i.sku ?? "",
          tag: i.tag ?? "",
          specified: i.specified ?? false,
          procured: i.procured ?? true,
          imageUrl: i.image && i.image !== "box" ? img(i.image) : "",
          markupBps: i.markup ?? 4000,
          msrpCents: i.msrp ? $(i.msrp) : 0,
          sort,
          updatedAt: when,
        })
        .returning({ id: items.id });
      await sys.insert(itemComponents).values(
        i.parts.map((part, s) => ({
          studioId,
          itemId: it!.id,
          vendorId: vendorIds.get(part.vendor) ?? null,
          description: part.desc,
          netCostCents: $(part.cost),
          qty: part.qty ?? 1,
          freightCents: $(part.freight ?? 0),
          cratingCents: $(part.crating ?? 0),
          receivingCents: $(part.receiving ?? 0),
          installCents: $(part.install ?? 0),
          shipTo: part.shipTo ?? "",
          sort: s,
        })),
      );
    }
  }
}

/**
 * Hollis's branding and terms, plus one proposal already sent to the
 * Hendersons, so the client link can be tried right away. Returns its link.
 */
export async function seedProposal(db: Database, studioId: string, appOrigin: string): Promise<string | null> {
  await db.sys
    .update(studios)
    .set({
      address: "2810 Routh St, Suite 200\nDallas, TX 75201",
      email: "studio@hollis.test",
      phone: "(214) 555-0100",
      proposalTerms:
        "A deposit is due on approval. Custom and made-to-order items are ordered only after the deposit clears, and their deposits are non-refundable once ordered.\n\nThe balance, freight and installation are invoiced before delivery. Lead times are vendor estimates.",
    })
    .where(eq(studios.id, studioId));

  return db.withStudio(studioId, async (tx) => {
    const [project] = await tx
      .select({ p: projects, exempt: clients.taxExempt, clientName: clients.name, clientEmail: clients.email })
      .from(projects)
      .innerJoin(clients, eq(clients.id, projects.clientId))
      .where(eq(projects.name, "Henderson Residence"));
    if (!project) return null;
    const proposed = await tx.select({ id: items.id }).from(items).where(and(eq(items.projectId, project.p.id), eq(items.status, "proposed")));
    const tax = { taxRateBps: project.p.taxRateBps, taxCharges: project.p.taxCharges, taxExempt: project.exempt };
    const lines = await snapshotItems(tx, project.p.id, tax, proposed.map((i) => i.id));
    const sentAt = new Date(Date.now() - 2 * DAY);
    const [p] = await tx.insert(proposals).values({ studioId, projectId: project.p.id, number: 1, title: "Living, dining and primary suite", createdAt: sentAt, updatedAt: sentAt }).returning();
    const [v] = await tx
      .insert(proposalVersions)
      .values({
        studioId,
        proposalId: p!.id,
        version: 1,
        status: "sent",
        depositBps: 5000,
        intro: "Kate and James, here are the pieces we talked through on Thursday. Approve what you love, decline anything that isn't right, and we'll keep looking.",
        terms: (await tx.select({ t: studios.proposalTerms }).from(studios).where(eq(studios.id, studioId)))[0]!.t,
        clientName: project.clientName,
        clientEmail: project.clientEmail,
        sentAt,
        createdAt: sentAt,
      })
      .returning();
    await tx.insert(proposalLines).values(lines.map((l, sort) => ({ ...l, studioId, versionId: v!.id, sort })));
    const [link] = await tx.insert(shareLinks).values({ studioId, audience: "client", proposalId: p!.id, createdAt: sentAt }).returning();
    return shareUrl(appOrigin, DEV_LINK_SECRET, link!.id);
  });
}
