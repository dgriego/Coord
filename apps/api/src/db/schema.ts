import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  ItemStatus,
  LineDecision,
  PaymentMethod,
  PaymentStatus,
  PricingMode,
  ProjectColor,
  ProjectPhase,
  ProjectStatus,
  ProposalStatus,
  Role,
  VendorCategory,
} from "@coord/shared";

// Typed view of the tables. The SQL in migrations.ts is the source of truth for
// constraints and row-level security; keep the two in step.

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt,
});

export const studios = pgTable("studios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  depositBps: integer("deposit_bps").notNull().default(5000),
  proposalTerms: text("proposal_terms").notNull().default(""),
  stripeAccountId: text("stripe_account_id"),
  stripeChargesEnabled: boolean("stripe_charges_enabled").notNull().default(false),
  createdAt,
});

export const memberships = pgTable(
  "memberships",
  {
    studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<Role>().notNull(),
    createdAt,
  },
  (t) => [primaryKey({ columns: [t.studioId, t.userId] })],
);

export const sessions = pgTable("sessions", {
  // SHA-256 of the cookie token, so a database leak doesn't leak live sessions.
  id: text("id").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
});

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: text("role").$type<Role>().notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
  createdAt,
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  createdAt,
});

const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const studioId = () => uuid("studio_id").notNull().references(() => studios.id, { onDelete: "cascade" });
const str = (name: string) => text(name).notNull().default("");
const money = (name: string) => bigint(name, { mode: "number" }).notNull().default(0);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  name: text("name").notNull(),
  email: str("email"),
  phone: str("phone"),
  address: str("address"),
  taxExempt: boolean("tax_exempt").notNull().default(false),
  notes: str("notes"),
  createdAt,
  updatedAt,
});

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  name: text("name").notNull(),
  categories: text("categories").array().$type<VendorCategory[]>().notNull().default([]),
  website: str("website"),
  email: str("email"),
  phone: str("phone"),
  accountNumber: str("account_number"),
  repName: str("rep_name"),
  repEmail: str("rep_email"),
  city: str("city"),
  state: str("state"),
  discountBps: integer("discount_bps").notNull().default(0),
  leadTimeWeeks: integer("lead_time_weeks"),
  paymentTerms: str("payment_terms"),
  notes: str("notes"),
  createdAt,
  updatedAt,
});

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phase: text("phase").$type<ProjectPhase>().notNull().default("consultation"),
  status: text("status").$type<ProjectStatus>().notNull().default("active"),
  color: text("color").$type<ProjectColor>().notNull().default("lagoon"),
  address: str("address"),
  budgetCents: bigint("budget_cents", { mode: "number" }),
  taxRateBps: integer("tax_rate_bps").notNull().default(0),
  taxCharges: boolean("tax_charges").notNull().default(false),
  defaultMarkupBps: integer("default_markup_bps").notNull().default(3500),
  createdAt,
  updatedAt,
});

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  sort: integer("sort").notNull().default(0),
});

export const items = pgTable("items", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  roomId: uuid("room_id").references(() => rooms.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: str("description"),
  category: str("category"),
  sku: str("sku"),
  dimensions: str("dimensions"),
  finish: str("finish"),
  qty: integer("qty").notNull().default(1),
  unit: str("unit"),
  status: text("status").$type<ItemStatus>().notNull().default("draft"),
  procured: boolean("procured").notNull().default(true),
  specified: boolean("specified").notNull().default(false),
  tag: str("tag"),
  imageUrl: str("image_url"),
  sourceUrl: str("source_url"),
  notes: str("notes"),
  pricingMode: text("pricing_mode").$type<PricingMode>().notNull().default("markup"),
  markupBps: integer("markup_bps").notNull().default(3500),
  marginBps: integer("margin_bps").notNull().default(0),
  msrpCents: money("msrp_cents"),
  msrpDiscountBps: integer("msrp_discount_bps").notNull().default(0),
  fixedPriceCents: money("fixed_price_cents"),
  sort: integer("sort").notNull().default(0),
  createdAt,
  updatedAt,
});

export const itemComponents = pgTable("item_components", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id").references(() => vendors.id, { onDelete: "set null" }),
  description: str("description"),
  netCostCents: money("net_cost_cents"),
  qty: doublePrecision("qty").notNull().default(1),
  freightCents: money("freight_cents"),
  cratingCents: money("crating_cents"),
  receivingCents: money("receiving_cents"),
  installCents: money("install_cents"),
  shipTo: str("ship_to"),
  sort: integer("sort").notNull().default(0),
});

export const proposals = pgTable("proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt,
  updatedAt,
});

export const proposalVersions = pgTable("proposal_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  proposalId: uuid("proposal_id").notNull().references(() => proposals.id, { onDelete: "cascade" }),
  version: integer("version").notNull(),
  status: text("status").$type<ProposalStatus>().notNull().default("draft"),
  intro: str("intro"),
  terms: str("terms"),
  depositBps: integer("deposit_bps").notNull(),
  clientName: str("client_name"),
  clientEmail: str("client_email"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  signedName: text("signed_name"),
  signedEmail: text("signed_email"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedIp: text("signed_ip"),
  signedUserAgent: text("signed_user_agent"),
  signedHash: text("signed_hash"),
  createdAt,
});

export const proposalLines = pgTable("proposal_lines", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  versionId: uuid("version_id").notNull().references(() => proposalVersions.id, { onDelete: "cascade" }),
  itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
  sort: integer("sort").notNull().default(0),
  roomName: str("room_name"),
  name: text("name").notNull(),
  description: str("description"),
  dimensions: str("dimensions"),
  finish: str("finish"),
  imageUrl: str("image_url"),
  qty: integer("qty").notNull(),
  unit: str("unit"),
  unitCostCents: money("unit_cost_cents"),
  unitPriceCents: bigint("unit_price_cents", { mode: "number" }).notNull(),
  chargesCents: money("charges_cents"),
  taxCents: money("tax_cents"),
  depositBps: integer("deposit_bps"),
  decision: text("decision").$type<LineDecision>().notNull().default("pending"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  clientNote: str("client_note"),
});

export const shareLinks = pgTable("share_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  audience: text("audience").$type<"client" | "vendor" | "contractor">().notNull(),
  proposalId: uuid("proposal_id").references(() => proposals.id, { onDelete: "cascade" }),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt,
  lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const shareCodes = pgTable("share_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  linkId: uuid("link_id").notNull().references(() => shareLinks.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt,
});

export const shareSessions = pgTable("share_sessions", {
  // SHA-256 of the cookie token, like sessions.
  id: text("id").primaryKey(),
  studioId: studioId(),
  linkId: uuid("link_id").notNull().references(() => shareLinks.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  studioId: studioId(),
  projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  versionId: uuid("version_id").references(() => proposalVersions.id, { onDelete: "set null" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: text("currency").notNull().default("usd"),
  method: text("method").$type<PaymentMethod>(),
  status: text("status").$type<PaymentStatus>().notNull(),
  note: str("note"),
  providerSessionId: text("provider_session_id"),
  providerPaymentId: text("provider_payment_id"),
  recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
  createdAt,
  paidAt: timestamp("paid_at", { withTimezone: true }),
});

export const schema = {
  users,
  studios,
  memberships,
  sessions,
  invitations,
  auditLog,
  clients,
  vendors,
  projects,
  rooms,
  items,
  itemComponents,
  proposals,
  proposalVersions,
  proposalLines,
  shareLinks,
  shareCodes,
  shareSessions,
  payments,
};
