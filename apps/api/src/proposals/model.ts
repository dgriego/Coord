import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  depositTotal,
  lineDeposit,
  type ItemStatus,
  type Payment,
  type ProposalDetail,
  type ProposalLine,
  type ProposalTotals,
  type SharedProposal,
} from "@coord/shared";
import type { Tx } from "../db/client.ts";
import { items, payments, proposalLines, proposals, proposalVersions, rooms, shareLinks } from "../db/schema.ts";
import { loadComponents, pricingFor, type TaxContext } from "../catalog/items.ts";

type VersionRow = typeof proposalVersions.$inferSelect;
type LineRow = typeof proposalLines.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type ProposalRow = typeof proposals.$inferSelect;

export interface Bundle {
  proposal: ProposalRow;
  version: VersionRow;
  versions: VersionRow[];
  lines: LineRow[];
  payments: PaymentRow[];
}

/** Loads one version of a proposal (the newest when `versionNumber` is omitted). */
export async function loadBundle(tx: Tx, proposalId: string, versionNumber?: number): Promise<Bundle | null> {
  const [proposal] = await tx.select().from(proposals).where(eq(proposals.id, proposalId));
  if (!proposal) return null;
  const versions = await tx.select().from(proposalVersions).where(eq(proposalVersions.proposalId, proposalId)).orderBy(desc(proposalVersions.version));
  const version = versionNumber === undefined ? versions[0] : versions.find((v) => v.version === versionNumber);
  if (!version) return null;
  const lines = await tx.select().from(proposalLines).where(eq(proposalLines.versionId, version.id)).orderBy(asc(proposalLines.sort));
  const pays = await tx.select().from(payments).where(eq(payments.versionId, version.id)).orderBy(asc(payments.createdAt));
  return { proposal, version, versions, lines, payments: pays };
}

export const isSigned = (v: VersionRow) => v.signedAt !== null;

// ── Money ───────────────────────────────────────────────

function lineTotals(l: LineRow, versionDepositBps: number) {
  const totalCents = l.unitPriceCents * l.qty + l.chargesCents + l.taxCents;
  const depositBps = l.depositBps ?? versionDepositBps;
  return { totalCents, depositBps, depositCents: lineDeposit(totalCents, depositBps) };
}

export function totalsFor(b: Pick<Bundle, "version" | "lines" | "payments">): ProposalTotals {
  const rows = b.lines.map((l) => ({ ...l, ...lineTotals(l, b.version.depositBps) }));
  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((s, r) => s + f(r), 0);
  const signed = isSigned(b.version);
  const deposit = depositTotal(rows, signed);
  const paid = b.payments.filter((p) => p.status === "succeeded").reduce((s, p) => s + p.amountCents, 0);
  const processing = b.payments.filter((p) => p.status === "processing").reduce((s, p) => s + p.amountCents, 0);
  return {
    subtotalCents: sum((r) => r.unitPriceCents * r.qty + r.chargesCents),
    taxCents: sum((r) => r.taxCents),
    totalCents: sum((r) => r.totalCents),
    approvedCents: sum((r) => (r.decision === "approved" ? r.totalCents : 0)),
    depositCents: deposit,
    paidCents: paid,
    processingCents: processing,
    balanceDueCents: Math.max(0, deposit - paid - processing),
  };
}

// ── Serializers ─────────────────────────────────────────

function payment(p: PaymentRow): Payment {
  return {
    id: p.id,
    amountCents: p.amountCents,
    method: p.method,
    status: p.status,
    note: p.note,
    createdAt: p.createdAt.toISOString(),
    paidAt: p.paidAt?.toISOString() ?? null,
  };
}

/**
 * The studio's view of a proposal. Lines carry their cost snapshot only for
 * roles with cost.view (PLAN.md 7).
 */
export function serializeProposal(
  b: Bundle,
  ctx: { canViewCost: boolean; projectName: string; clientName: string | null; clientEmail: string; shareUrl: string | null; share: typeof shareLinks.$inferSelect | null },
): ProposalDetail {
  const { proposal: p, version: v } = b;
  const totals = totalsFor(b);
  const lines: ProposalLine[] = b.lines.map((l) => {
    const t = lineTotals(l, v.depositBps);
    const line: ProposalLine = {
      id: l.id,
      itemId: l.itemId,
      roomName: l.roomName,
      name: l.name,
      description: l.description,
      dimensions: l.dimensions,
      finish: l.finish,
      imageUrl: l.imageUrl,
      qty: l.qty,
      unit: l.unit,
      unitPriceCents: l.unitPriceCents,
      chargesCents: l.chargesCents,
      taxCents: l.taxCents,
      totalCents: t.totalCents,
      depositBpsOverride: l.depositBps,
      depositBps: t.depositBps,
      depositCents: t.depositCents,
      decision: l.decision,
      clientNote: l.clientNote,
    };
    if (ctx.canViewCost) {
      line.unitCostCents = l.unitCostCents;
      line.profitCents = (l.unitPriceCents - l.unitCostCents) * l.qty;
    }
    return line;
  });
  const detail: ProposalDetail = {
    id: p.id,
    projectId: p.projectId,
    number: p.number,
    title: p.title,
    version: v.version,
    versionId: v.id,
    status: v.status,
    lineCount: lines.length,
    totalCents: totals.totalCents,
    depositCents: totals.depositCents,
    paidCents: totals.paidCents,
    sentAt: v.sentAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
    projectName: ctx.projectName,
    // A sent version keeps the client it went to, even if the project changes later.
    clientName: v.sentAt ? v.clientName : ctx.clientName,
    clientEmail: v.sentAt ? v.clientEmail : ctx.clientEmail,
    versions: b.versions.map((x) => ({ id: x.id, version: x.version, status: x.status, createdAt: x.createdAt.toISOString() })),
    latest: b.versions[0]?.id === v.id,
    intro: v.intro,
    terms: v.terms,
    depositBps: v.depositBps,
    lines,
    totals,
    signature: v.signedAt
      ? {
          name: v.signedName ?? "",
          email: v.signedEmail ?? "",
          signedAt: v.signedAt.toISOString(),
          ip: v.signedIp ?? "",
          userAgent: v.signedUserAgent ?? "",
          documentHash: v.signedHash ?? "",
        }
      : null,
    payments: b.payments.map(payment),
    share:
      ctx.share && ctx.shareUrl
        ? { url: ctx.shareUrl, createdAt: ctx.share.createdAt.toISOString(), lastViewedAt: ctx.share.lastViewedAt?.toISOString() ?? null }
        : null,
  };
  if (ctx.canViewCost) {
    const cost = b.lines.reduce((s, l) => s + l.unitCostCents * l.qty, 0);
    const price = b.lines.reduce((s, l) => s + l.unitPriceCents * l.qty, 0);
    detail.costTotals = { costCents: cost, profitCents: price - cost, marginBps: price ? Math.round(((price - cost) / price) * 10_000) : null };
  }
  return detail;
}

export interface ShareContext {
  studio: { name: string; address: string; email: string; phone: string };
  project: { name: string; address: string };
  verified: boolean;
  paymentMode: "stripe" | "simulated" | null;
}

/**
 * The client's view through a share link. Every field is copied by name from
 * an allow-list: no cost, markup, margin, vendor or internal id can reach it
 * by accident (PLAN.md 7 and 9.3). Tests fail if a forbidden field appears.
 */
export function serializeShared(b: Bundle, ctx: ShareContext): SharedProposal {
  const { proposal: p, version: v } = b;
  const totals = totalsFor(b);
  const open = v.status === "sent" && !isSigned(v);
  const hasLines = b.lines.length > 0;
  const allDecided = hasLines && b.lines.every((l) => l.decision !== "pending");
  const anyApproved = b.lines.some((l) => l.decision === "approved");
  return {
    studio: { name: ctx.studio.name, address: ctx.studio.address, email: ctx.studio.email, phone: ctx.studio.phone },
    project: { name: ctx.project.name, address: ctx.project.address },
    clientName: v.clientName,
    number: p.number,
    title: p.title,
    version: v.version,
    status: v.status,
    sentAt: v.sentAt?.toISOString() ?? null,
    intro: v.intro,
    terms: v.terms,
    depositBps: v.depositBps,
    lines: b.lines.map((l) => {
      const t = lineTotals(l, v.depositBps);
      return {
        id: l.id,
        roomName: l.roomName,
        name: l.name,
        description: l.description,
        dimensions: l.dimensions,
        finish: l.finish,
        imageUrl: l.imageUrl,
        qty: l.qty,
        unit: l.unit,
        unitPriceCents: l.unitPriceCents,
        chargesCents: l.chargesCents,
        taxCents: l.taxCents,
        totalCents: t.totalCents,
        depositBps: t.depositBps,
        depositCents: t.depositCents,
        decision: l.decision,
        clientNote: l.clientNote,
      };
    }),
    totals,
    signature: v.signedAt ? { name: v.signedName ?? "", signedAt: v.signedAt.toISOString(), documentHash: v.signedHash ?? "" } : null,
    payments: b.payments
      .filter((x) => x.status !== "canceled" && x.status !== "pending")
      .map((x) => ({ amountCents: x.amountCents, method: x.method, status: x.status, paidAt: x.paidAt?.toISOString() ?? null })),
    maskedEmail: maskEmail(v.clientEmail),
    verified: ctx.verified,
    canDecide: open,
    canSign: open && allDecided && anyApproved,
    canPay: isSigned(v) && totals.balanceDueCents > 0 && ctx.paymentMode !== null,
    paymentMode: ctx.paymentMode,
  };
}

export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  if (!domain) return "";
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, user.length - 1)))}@${domain}`;
}

/**
 * SHA-256 of what the client signs: every client-visible term, line and
 * decision, in a fixed order. Stored with the signature as evidence (PLAN.md 11.7).
 */
export function documentHash(b: Bundle, signer: { name: string; email: string }): string {
  const t = totalsFor(b);
  const doc = {
    proposal: b.proposal.id,
    number: b.proposal.number,
    title: b.proposal.title,
    version: b.version.version,
    client: [b.version.clientName, b.version.clientEmail],
    intro: b.version.intro,
    terms: b.version.terms,
    depositBps: b.version.depositBps,
    lines: b.lines.map((l) => [l.id, l.name, l.qty, l.unitPriceCents, l.chargesCents, l.taxCents, l.depositBps ?? b.version.depositBps, l.decision]),
    totals: [t.totalCents, t.approvedCents, t.depositCents],
    signer: [signer.name, signer.email],
  };
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

// ── Snapshots ───────────────────────────────────────────

/** Line values for items, priced now. Items from other projects are skipped. */
export async function snapshotItems(tx: Tx, projectId: string, tax: TaxContext, itemIds: string[]) {
  if (itemIds.length === 0) return [];
  const rows = await tx.select().from(items).where(and(eq(items.projectId, projectId), inArray(items.id, itemIds))).orderBy(asc(items.sort), asc(items.createdAt));
  const roomRows = await tx.select({ id: rooms.id, name: rooms.name, sort: rooms.sort }).from(rooms).where(eq(rooms.projectId, projectId));
  const roomOf = new Map(roomRows.map((r) => [r.id, r]));
  const comps = await loadComponents(tx, rows.map((r) => r.id));
  // Group by room order, like the project page.
  rows.sort((a, b) => (roomOf.get(a.roomId ?? "")?.sort ?? 999) - (roomOf.get(b.roomId ?? "")?.sort ?? 999));
  return rows.map((i) => {
    const r = pricingFor(i, comps.get(i.id) ?? [], tax);
    return {
      itemId: i.id,
      roomName: roomOf.get(i.roomId ?? "")?.name ?? "",
      name: i.name,
      description: i.description,
      dimensions: i.dimensions,
      finish: i.finish,
      imageUrl: i.imageUrl,
      qty: i.qty,
      unit: i.unit,
      unitCostCents: r.unitCostCents,
      unitPriceCents: r.unitPriceCents,
      chargesCents: r.chargesCents,
      taxCents: r.taxCents,
    };
  });
}

/** Moves items forward only: a later status set elsewhere is never undone. */
export async function advanceItems(tx: Tx, itemIds: (string | null)[], to: ItemStatus, from: ItemStatus[]) {
  const ids = itemIds.filter((x): x is string => !!x);
  if (ids.length === 0) return;
  await tx
    .update(items)
    .set({ status: to, updatedAt: new Date() })
    .where(and(inArray(items.id, ids), inArray(items.status, from)));
}

/**
 * Once the deposit on a signed version is fully paid (settled, not just
 * processing), its approved items move to deposit_paid.
 */
export async function settleDeposit(tx: Tx, proposalId: string, versionNumber: number): Promise<boolean> {
  const b = await loadBundle(tx, proposalId, versionNumber);
  if (!b || !isSigned(b.version)) return false;
  const t = totalsFor(b);
  if (t.depositCents > 0 && t.paidCents < t.depositCents) return false;
  const approved = b.lines.filter((l) => l.decision === "approved").map((l) => l.itemId);
  await advanceItems(tx, approved, "deposit_paid", ["draft", "proposed", "approved"]);
  return true;
}

// ── Share tokens ────────────────────────────────────────

/** `<link id>.<HMAC>`: verifiable without storing a secret per link. */
export function shareToken(secret: string, linkId: string): string {
  return `${linkId}.${createHmac("sha256", secret).update(`share:${linkId}`).digest("base64url")}`;
}

/** Returns the link id when the token was signed by us, otherwise null. */
export function parseShareToken(secret: string, token: string): string | null {
  const [id, sig] = token.split(".");
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const expected = Buffer.from(shareToken(secret, id).split(".")[1]!);
  const got = Buffer.from(sig);
  return got.length === expected.length && timingSafeEqual(got, expected) ? id : null;
}

export const shareUrl = (origin: string, secret: string, linkId: string) => `${origin}/p/${shareToken(secret, linkId)}`;

/** Signs links in local development and seed data only; production requires LINK_SECRET. */
export const DEV_LINK_SECRET = "local-dev-link-secret";
