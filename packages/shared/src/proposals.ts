import { z } from "zod";

// Proposals, client share links, e-signatures and deposits (PLAN.md 6.2, M2).
// A proposal has numbered versions. Each version holds lines that snapshot an
// item's client pricing, so later item edits never change a sent document.

export const PROPOSAL_STATUSES = ["draft", "sent", "partially_approved", "approved", "superseded"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  partially_approved: "Partly approved",
  approved: "Approved",
  superseded: "Replaced",
};

export const LINE_DECISIONS = ["pending", "approved", "rejected"] as const;
export type LineDecision = (typeof LINE_DECISIONS)[number];

export const PAYMENT_STATUSES = ["pending", "processing", "succeeded", "failed", "canceled"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "Checkout open",
  // ACH takes several days to settle, so it is never shown as paid early (PLAN.md 11.6).
  processing: "Processing",
  succeeded: "Paid",
  failed: "Failed",
  canceled: "Canceled",
};

export const PAYMENT_METHODS = ["card", "us_bank_account", "check", "wire", "cash", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Card",
  us_bank_account: "Bank transfer (ACH)",
  check: "Check",
  wire: "Wire",
  cash: "Cash",
  other: "Other",
};
export const MANUAL_PAYMENT_METHODS = ["check", "wire", "cash", "other"] as const;

/** Deposit on one line, rounded half up to the cent at the line (PLAN.md 5, rule 4). */
export function lineDeposit(totalCents: number, depositBps: number): number {
  return Math.round((totalCents * depositBps) / 10_000 + Number.EPSILON);
}

export interface DepositLine {
  totalCents: number;
  depositBps: number;
  decision: LineDecision;
}

/**
 * Deposit owed on a version. Before the client decides, every line not
 * rejected counts, so the client sees what approving everything would cost.
 */
export function depositTotal(lines: DepositLine[], approvedOnly: boolean): number {
  return lines
    .filter((l) => (approvedOnly ? l.decision === "approved" : l.decision !== "rejected"))
    .reduce((sum, l) => sum + lineDeposit(l.totalCents, l.depositBps), 0);
}

export const formatProposalNumber = (n: number) => `P-${String(n).padStart(4, "0")}`;

// ── Inputs ──────────────────────────────────────────────

const bps = z.number().int().min(0).max(10_000);

export const proposalInput = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1, "Give the proposal a title").max(200),
  itemIds: z.array(z.string().uuid()).max(500).optional().default([]),
});
export type ProposalInput = z.input<typeof proposalInput>;

export const proposalPatch = z.object({
  title: z.string().trim().min(1, "Give the proposal a title").max(200),
  intro: z.string().trim().max(4000),
  terms: z.string().trim().max(20_000),
  depositBps: bps,
}).partial();
export type ProposalPatch = z.input<typeof proposalPatch>;

export const proposalLinesInput = z.object({ itemIds: z.array(z.string().uuid()).min(1).max(500) });

export const proposalLinePatch = z.object({
  /** Overrides the version's deposit for this line; null goes back to the default. */
  depositBps: bps.nullable(),
});

export const manualPaymentInput = z.object({
  amountCents: z.number().int().min(1).max(100_000_000_00),
  method: z.enum(MANUAL_PAYMENT_METHODS),
  note: z.string().trim().max(500).optional().default(""),
});
export type ManualPaymentInput = z.input<typeof manualPaymentInput>;

export const studioSettingsInput = z.object({
  name: z.string().trim().min(1, "Enter your studio's name").max(120),
  address: z.string().trim().max(400),
  email: z.union([z.literal(""), z.string().trim().toLowerCase().email("Enter a valid email")]),
  phone: z.string().trim().max(40),
  depositBps: bps,
  terms: z.string().trim().max(20_000),
}).partial();
export type StudioSettingsInput = z.input<typeof studioSettingsInput>;

// Share-link actions taken by the client.
export const shareCodeInput = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
export const shareDecisionInput = z.object({
  decision: z.enum(LINE_DECISIONS),
  note: z.string().trim().max(1000).optional().default(""),
});
export const shareSignInput = z.object({
  name: z.string().trim().min(2, "Type your full name").max(120),
  agree: z.literal(true, { error: "Check the box to agree" }),
});
export const shareCheckoutInput = z.object({ method: z.enum(["card", "us_bank_account"]).optional() });

// ── Responses ───────────────────────────────────────────

export interface ProposalLine {
  id: string;
  itemId: string | null;
  roomName: string;
  name: string;
  description: string;
  dimensions: string;
  finish: string;
  imageUrl: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
  chargesCents: number;
  taxCents: number;
  totalCents: number;
  /** The line's own deposit, or null when it uses the version's. */
  depositBpsOverride: number | null;
  depositBps: number;
  depositCents: number;
  decision: LineDecision;
  clientNote: string;
  /** Only for roles with cost.view. */
  unitCostCents?: number;
  profitCents?: number;
}

export interface ProposalTotals {
  /** Product plus freight, delivery and install, before tax. */
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  approvedCents: number;
  /** Deposit owed: approved lines once signed, otherwise every line not rejected. */
  depositCents: number;
  paidCents: number;
  processingCents: number;
  /** Deposit still to collect. */
  balanceDueCents: number;
}

export interface Signature {
  name: string;
  email: string;
  signedAt: string;
  ip: string;
  userAgent: string;
  /** SHA-256 of the exact document the client signed. */
  documentHash: string;
}

export interface Payment {
  id: string;
  amountCents: number;
  method: PaymentMethod | null;
  status: PaymentStatus;
  note: string;
  createdAt: string;
  paidAt: string | null;
}

export interface ProposalSummary {
  id: string;
  projectId: string;
  number: number;
  title: string;
  version: number;
  status: ProposalStatus;
  lineCount: number;
  totalCents: number;
  depositCents: number;
  paidCents: number;
  sentAt: string | null;
  updatedAt: string;
}

export interface ProposalDetail extends ProposalSummary {
  versionId: string;
  projectName: string;
  clientName: string | null;
  clientEmail: string;
  versions: { id: string; version: number; status: ProposalStatus; createdAt: string }[];
  /** Whether this is the newest version; older ones are read-only. */
  latest: boolean;
  intro: string;
  terms: string;
  depositBps: number;
  lines: ProposalLine[];
  totals: ProposalTotals;
  /** Only for roles with cost.view. */
  costTotals?: { costCents: number; profitCents: number; marginBps: number | null };
  signature: Signature | null;
  payments: Payment[];
  share: { url: string; createdAt: string; lastViewedAt: string | null } | null;
}

/** What the client sees through the share link. Built from an allow-list. */
export interface SharedProposalLine {
  id: string;
  roomName: string;
  name: string;
  description: string;
  dimensions: string;
  finish: string;
  imageUrl: string;
  qty: number;
  unit: string;
  unitPriceCents: number;
  chargesCents: number;
  taxCents: number;
  totalCents: number;
  depositBps: number;
  depositCents: number;
  decision: LineDecision;
  clientNote: string;
}

export interface SharedProposal {
  studio: { name: string; address: string; email: string; phone: string };
  project: { name: string; address: string };
  clientName: string;
  number: number;
  title: string;
  version: number;
  status: ProposalStatus;
  sentAt: string | null;
  intro: string;
  terms: string;
  depositBps: number;
  lines: SharedProposalLine[];
  totals: ProposalTotals;
  signature: { name: string; signedAt: string; documentHash: string } | null;
  payments: { amountCents: number; method: PaymentMethod | null; status: PaymentStatus; paidAt: string | null }[];
  /** Email the code goes to, partly hidden. */
  maskedEmail: string;
  /** True once the visitor proved they hold the client's email. */
  verified: boolean;
  canDecide: boolean;
  canSign: boolean;
  canPay: boolean;
  /** "stripe", "simulated" (local dev) or null when the studio can't take payments yet. */
  paymentMode: "stripe" | "simulated" | null;
}

export interface StudioSettings {
  name: string;
  address: string;
  email: string;
  phone: string;
  depositBps: number;
  terms: string;
}

export interface PaymentAccount {
  /** "stripe" with real keys, "simulated" in local dev without keys, null when unavailable. */
  mode: "stripe" | "simulated" | null;
  status: "not_connected" | "pending" | "enabled";
  accountId: string | null;
}
