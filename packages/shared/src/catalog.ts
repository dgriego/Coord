import { z } from "zod";
import { PRICING_MODES, type PricingMode, type PricingResult } from "./pricing.ts";

// Clients, vendors, projects, rooms and items (PLAN.md 5). Inputs are zod
// schemas shared by the API (validation) and the web app (forms).

export const VENDOR_CATEGORIES = [
  "upholstery",
  "casegoods",
  "lighting",
  "plumbing",
  "fabric",
  "wallcovering",
  "rugs",
  "tile_stone",
  "hardware",
  "paint",
  "accessories",
  "art",
  "outdoor",
  "workroom",
  "window_treatments",
  "appliances",
] as const;
export type VendorCategory = (typeof VENDOR_CATEGORIES)[number];

export const VENDOR_CATEGORY_LABELS: Record<VendorCategory, string> = {
  upholstery: "Upholstery",
  casegoods: "Casegoods",
  lighting: "Lighting",
  plumbing: "Plumbing",
  fabric: "Fabric",
  wallcovering: "Wallcovering",
  rugs: "Rugs",
  tile_stone: "Tile and stone",
  hardware: "Hardware",
  paint: "Paint",
  accessories: "Accessories",
  art: "Art",
  outdoor: "Outdoor",
  workroom: "Workroom",
  window_treatments: "Window treatments",
  appliances: "Appliances",
};

export const PROJECT_PHASES = ["consultation", "schematic", "design_development", "construction_admin", "closed"] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];
export const PROJECT_PHASE_LABELS: Record<ProjectPhase, string> = {
  consultation: "Consultation",
  schematic: "Schematic design",
  design_development: "Design development",
  construction_admin: "Construction administration",
  closed: "Closed",
};

// Each project gets a paint color: it tints the project card, header and
// room tiles, so studios can tell projects apart at a glance.
export const PROJECT_COLORS = ["marigold", "persimmon", "rosewater", "orchid", "cobalt", "lagoon", "fern", "citrine"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];
export const PROJECT_COLOR_LABELS: Record<ProjectColor, string> = {
  marigold: "Marigold",
  persimmon: "Persimmon",
  rosewater: "Rosewater",
  orchid: "Orchid",
  cobalt: "Cobalt",
  lagoon: "Lagoon",
  fern: "Fern",
  citrine: "Citrine",
};

export const PROJECT_STATUSES = ["active", "on_hold", "complete"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  on_hold: "On hold",
  complete: "Complete",
};

// Statuses after "approved" are set by proposals and POs in M2 and M3.
export const ITEM_STATUSES = [
  "draft",
  "proposed",
  "approved",
  "rejected",
  "ordered",
  "received",
  "installed",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  draft: "Draft",
  proposed: "Proposed",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  received: "Received",
  installed: "Installed",
};

const text = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 200) => text(max).optional().default("");
const cents = z.number().int().min(0).max(100_000_000_00);
const bps = z.number().int().min(0).max(100_000);
const optionalEmail = z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email")]).optional().default("");

// ── Clients ─────────────────────────────────────────────

export const clientInput = z.object({
  name: text().min(1, "Enter the client's name"),
  email: optionalEmail,
  phone: optionalText(40),
  address: optionalText(400),
  taxExempt: z.boolean().optional().default(false),
  notes: optionalText(4000),
});
export type ClientInput = z.input<typeof clientInput>;

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  taxExempt: boolean;
  notes: string;
  projectCount: number;
  createdAt: string;
}

// ── Vendors ─────────────────────────────────────────────

export const vendorInput = z.object({
  name: text().min(1, "Enter the vendor's name"),
  categories: z.array(z.enum(VENDOR_CATEGORIES)).max(8).optional().default([]),
  website: optionalText(300),
  email: optionalEmail,
  phone: optionalText(40),
  accountNumber: optionalText(80),
  repName: optionalText(120),
  repEmail: optionalEmail,
  city: optionalText(80),
  state: optionalText(40),
  /** Trade discount off retail, in basis points. */
  discountBps: bps.optional().default(0),
  leadTimeWeeks: z.number().int().min(0).max(104).nullable().optional().default(null),
  paymentTerms: optionalText(80),
  notes: optionalText(4000),
});
export type VendorInput = z.input<typeof vendorInput>;

export interface Vendor {
  id: string;
  name: string;
  categories: VendorCategory[];
  website: string;
  email: string;
  phone: string;
  accountNumber: string;
  repName: string;
  repEmail: string;
  city: string;
  state: string;
  discountBps: number;
  leadTimeWeeks: number | null;
  paymentTerms: string;
  notes: string;
  itemCount: number;
  createdAt: string;
}

export const vendorImportInput = z.object({
  csv: z.string().max(2_000_000),
  dryRun: z.boolean().optional().default(true),
});

export interface VendorImportResult {
  created: number;
  skipped: { row: number; name: string; reason: string }[];
  preview: VendorInput[];
}

// ── Projects and rooms ──────────────────────────────────

export const projectInput = z.object({
  name: text().min(1, "Enter a project name"),
  clientId: z.string().uuid().nullable().optional().default(null),
  phase: z.enum(PROJECT_PHASES).optional().default("consultation"),
  status: z.enum(PROJECT_STATUSES).optional().default("active"),
  color: z.enum(PROJECT_COLORS).optional(),
  address: optionalText(400),
  budgetCents: cents.nullable().optional().default(null),
  taxRateBps: bps.optional().default(0),
  taxCharges: z.boolean().optional().default(false),
  defaultMarkupBps: bps.optional().default(3500),
  rooms: z.array(text(80).min(1)).max(60).optional(),
});
export type ProjectInput = z.input<typeof projectInput>;

export const roomInput = z.object({ name: text(80).min(1, "Enter a room name") });

export interface Room {
  id: string;
  name: string;
  sort: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  phase: ProjectPhase;
  status: ProjectStatus;
  color: ProjectColor;
  address: string;
  budgetCents: number | null;
  itemCount: number;
  roomCount: number;
  /** Up to four item images, for the project card. */
  previewImages: string[];
  /** Sum of client prices (product + charges, before tax) of items not rejected. */
  proposedCents: number;
  updatedAt: string;
}

// ── Items and their parts ───────────────────────────────

export const componentInput = z.object({
  vendorId: z.string().uuid().nullable().optional().default(null),
  description: optionalText(300),
  netCostCents: cents.optional().default(0),
  qty: z.number().min(0).max(100_000).optional().default(1),
  freightCents: cents.optional().default(0),
  cratingCents: cents.optional().default(0),
  receivingCents: cents.optional().default(0),
  installCents: cents.optional().default(0),
  shipTo: optionalText(300),
});
export type ComponentInput = z.input<typeof componentInput>;

export const itemInput = z.object({
  name: text().min(1, "Enter an item name"),
  roomId: z.string().uuid().nullable().optional().default(null),
  description: optionalText(2000),
  category: optionalText(80),
  sku: optionalText(120),
  dimensions: optionalText(200),
  finish: optionalText(300),
  qty: z.number().int().min(0).max(10_000).optional().default(1),
  unit: optionalText(20),
  status: z.enum(ITEM_STATUSES).optional().default("draft"),
  procured: z.boolean().optional().default(true),
  specified: z.boolean().optional().default(false),
  tag: optionalText(20),
  imageUrl: optionalText(1000),
  sourceUrl: optionalText(1000),
  notes: optionalText(4000),
  /** Main vendor. Used by roles that can't edit cost, which can't send components. */
  vendorId: z.string().uuid().nullable().optional(),
  // Pricing. Ignored without the pricing.edit permission.
  pricingMode: z.enum(PRICING_MODES).optional(),
  markupBps: bps.optional(),
  marginBps: bps.max(9_999).optional(),
  msrpCents: cents.optional(),
  msrpDiscountBps: bps.optional(),
  fixedPriceCents: cents.optional(),
  components: z.array(componentInput).max(20).optional(),
});
export type ItemInput = z.input<typeof itemInput>;
export const itemPatch = itemInput.partial();
export type ItemPatch = z.input<typeof itemPatch>;

/** The fields every role sees. */
export interface ItemBase {
  id: string;
  projectId: string;
  roomId: string | null;
  name: string;
  description: string;
  category: string;
  sku: string;
  dimensions: string;
  finish: string;
  qty: number;
  unit: string;
  status: ItemStatus;
  procured: boolean;
  specified: boolean;
  tag: string;
  imageUrl: string;
  sourceUrl: string;
  notes: string;
  vendorNames: string[];
  msrpCents: number;
  unitPriceCents: number;
  totalCents: number;
  updatedAt: string;
}

export interface ItemComponent {
  id: string;
  vendorId: string | null;
  vendorName: string | null;
  description: string;
  netCostCents: number;
  qty: number;
  freightCents: number;
  cratingCents: number;
  receivingCents: number;
  installCents: number;
  shipTo: string;
}

/** Cost and pricing detail, only sent to roles with cost.view. */
export interface ItemCostDetail {
  pricingMode: PricingMode;
  markupBps: number;
  marginBps: number;
  msrpDiscountBps: number;
  fixedPriceCents: number;
  components: ItemComponent[];
  pricing: PricingResult;
}

export type Item = ItemBase & Partial<ItemCostDetail>;

export interface ProjectDetail extends ProjectSummary {
  taxRateBps: number;
  taxCharges: boolean;
  defaultMarkupBps: number;
  clientTaxExempt: boolean;
  rooms: Room[];
  items: Item[];
  /** Only for roles with cost.view. */
  totals?: { costCents: number; priceCents: number; chargesCents: number; taxCents: number; profitCents: number; marginBps: number | null };
}

// ── URL import (clipper v1) ─────────────────────────────

export const clipInput = z.object({ url: z.string().trim().url("Paste a full link starting with https://").max(2000) });

export interface ClipResult {
  name: string;
  description: string;
  imageUrl: string;
  sourceUrl: string;
  sku: string;
  brand: string;
  /** Usually the retail price shown on the page. */
  msrpCents: number | null;
  /** A vendor in the studio's list whose website matches the page, if any. */
  vendorId: string | null;
  vendorName: string | null;
}
