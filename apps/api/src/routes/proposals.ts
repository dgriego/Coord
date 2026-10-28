import { Hono, type Context } from "hono";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  can,
  formatMoney,
  formatProposalNumber,
  manualPaymentInput,
  proposalInput,
  proposalLinePatch,
  proposalLinesInput,
  proposalPatch,
  type ProposalDetail,
  type ProposalSummary,
} from "@coord/shared";
import { requirePermission, requireSession, type Env } from "../context.ts";
import { clients, payments, projects, proposalLines, proposals, proposalVersions, shareLinks, studios } from "../db/schema.ts";
import type { Tx } from "../db/client.ts";
import { audit } from "../audit.ts";
import { body, HttpError, notFound, patchBody } from "../http.ts";
import {
  advanceItems,
  isSigned,
  loadBundle,
  serializeProposal,
  settleDeposit,
  shareUrl,
  snapshotItems,
  totalsFor,
  type Bundle,
} from "../proposals/model.ts";
import type { TaxContext } from "../catalog/items.ts";
import { changed, inStudio } from "./helpers.ts";

const canCost = (c: Context<Env>) => can(c.var.session.role, "cost.view");

async function projectContext(tx: Tx, projectId: string) {
  const [row] = await tx
    .select({ p: projects, clientName: clients.name, clientEmail: clients.email, exempt: clients.taxExempt })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId));
  if (!row) throw notFound("That project");
  const tax: TaxContext = { taxRateBps: row.p.taxRateBps, taxCharges: row.p.taxCharges, taxExempt: row.exempt ?? false };
  return { project: row.p, clientName: row.clientName, clientEmail: row.clientEmail ?? "", tax };
}

async function activeLink(tx: Tx, proposalId: string) {
  const [link] = await tx
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.proposalId, proposalId), isNull(shareLinks.revokedAt)))
    .orderBy(desc(shareLinks.createdAt))
    .limit(1);
  return link ?? null;
}

async function bundleOr404(tx: Tx, proposalId: string, version?: number): Promise<Bundle> {
  const b = await loadBundle(tx, proposalId, version);
  if (!b) throw notFound("That proposal");
  return b;
}

async function detail(c: Context<Env>, tx: Tx, proposalId: string, version?: number): Promise<ProposalDetail> {
  const b = await bundleOr404(tx, proposalId, version);
  const ctx = await projectContext(tx, b.proposal.projectId);
  const link = await activeLink(tx, proposalId);
  const { appOrigin, linkSecret } = c.var.deps.config;
  return serializeProposal(b, {
    canViewCost: canCost(c),
    projectName: ctx.project.name,
    clientName: ctx.clientName,
    clientEmail: ctx.clientEmail,
    share: link,
    shareUrl: link ? shareUrl(appOrigin, linkSecret, link.id) : null,
  });
}

/** The newest version, which must still be a draft to edit. */
async function editableDraft(tx: Tx, proposalId: string): Promise<Bundle> {
  const b = await bundleOr404(tx, proposalId);
  if (b.version.status !== "draft") {
    throw new HttpError(409, "not_draft", "This version was already sent. Start a new version to make changes.");
  }
  return b;
}

async function touch(tx: Tx, proposalId: string) {
  await tx.update(proposals).set({ updatedAt: new Date() }).where(eq(proposals.id, proposalId));
}

async function insertLines(tx: Tx, studioId: string, versionId: string, values: Awaited<ReturnType<typeof snapshotItems>>, startSort = 0, overrides = new Map<string, number | null>()) {
  if (values.length === 0) return;
  await tx.insert(proposalLines).values(
    values.map((v, i) => ({ ...v, studioId, versionId, sort: startSort + i, depositBps: overrides.get(v.itemId) ?? null })),
  );
}

function done(c: Context<Env>, projectId: string, proposalId: string) {
  changed(c, ["proposals", projectId], ["proposal", proposalId], ["project", projectId], ["projects"]);
}

export const proposalRoutes = new Hono<Env>()
  .use(requireSession)

  .get("/", async (c) => {
    const projectId = c.req.query("projectId");
    if (!projectId) throw new HttpError(400, "invalid_input", "Pass a projectId.");
    const list = await inStudio(c, async (tx) => {
      const rows = await tx.select().from(proposals).where(eq(proposals.projectId, projectId)).orderBy(desc(proposals.number));
      const out: ProposalSummary[] = [];
      for (const p of rows) {
        const b = await bundleOr404(tx, p.id);
        const t = totalsFor(b);
        out.push({
          id: p.id,
          projectId: p.projectId,
          number: p.number,
          title: p.title,
          version: b.version.version,
          status: b.version.status,
          lineCount: b.lines.length,
          totalCents: t.totalCents,
          depositCents: t.depositCents,
          paidCents: t.paidCents,
          sentAt: b.version.sentAt?.toISOString() ?? null,
          updatedAt: p.updatedAt.toISOString(),
        });
      }
      return out;
    });
    return c.json(list);
  })

  .post("/", requirePermission("projects.edit"), async (c) => {
    const input = await body(c, proposalInput);
    const { studioId, userId } = c.var.session;
    const result = await inStudio(c, async (tx) => {
      const { tax } = await projectContext(tx, input.projectId);
      const [studio] = await tx.select({ depositBps: studios.depositBps, terms: studios.proposalTerms }).from(studios).where(eq(studios.id, studioId));
      const [{ next } = { next: 1 }] = await tx.select({ next: sql<number>`coalesce(max(${proposals.number}) + 1, 1)::int` }).from(proposals);
      const [p] = await tx.insert(proposals).values({ studioId, projectId: input.projectId, number: next, title: input.title, createdBy: userId }).returning();
      const [v] = await tx
        .insert(proposalVersions)
        .values({ studioId, proposalId: p!.id, version: 1, depositBps: studio?.depositBps ?? 5000, terms: studio?.terms ?? "" })
        .returning();
      await insertLines(tx, studioId, v!.id, await snapshotItems(tx, input.projectId, tax, input.itemIds));
      await audit(tx, { studioId, actorUserId: userId, action: "proposal.created", entityType: "proposal", entityId: p!.id, after: { number: next, title: input.title } });
      return detail(c, tx, p!.id);
    });
    done(c, input.projectId, result.id);
    return c.json(result, 201);
  })

  .get("/:id", async (c) => {
    const v = c.req.query("version");
    const version = v && /^\d+$/.test(v) ? Number(v) : undefined;
    return c.json(await inStudio(c, (tx) => detail(c, tx, c.req.param("id"), version)));
  })

  .patch("/:id", requirePermission("projects.edit"), async (c) => {
    const input = await patchBody(c, proposalPatch);
    if (!can(c.var.session.role, "pricing.edit")) delete input.depositBps;
    const id = c.req.param("id");
    const result = await inStudio(c, async (tx) => {
      const b = await editableDraft(tx, id);
      const { title, ...version } = input;
      if (title !== undefined) await tx.update(proposals).set({ title }).where(eq(proposals.id, id));
      if (Object.keys(version).length) await tx.update(proposalVersions).set(version).where(eq(proposalVersions.id, b.version.id));
      await touch(tx, id);
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result);
  })

  .delete("/:id", requirePermission("projects.edit"), async (c) => {
    const { studioId, userId } = c.var.session;
    const id = c.req.param("id");
    const projectId = await inStudio(c, async (tx) => {
      const b = await bundleOr404(tx, id);
      if (b.versions.some((v) => v.sentAt)) {
        throw new HttpError(409, "already_sent", "Proposals that were sent are kept as a record and can't be deleted.");
      }
      await tx.delete(proposals).where(eq(proposals.id, id));
      await audit(tx, { studioId, actorUserId: userId, action: "proposal.deleted", entityType: "proposal", entityId: id, before: { number: b.proposal.number, title: b.proposal.title } });
      return b.proposal.projectId;
    });
    done(c, projectId, id);
    return c.body(null, 204);
  })

  // ── Lines (drafts only) ──
  .post("/:id/lines", requirePermission("projects.edit"), async (c) => {
    const { itemIds } = await body(c, proposalLinesInput);
    const id = c.req.param("id");
    const { studioId } = c.var.session;
    const result = await inStudio(c, async (tx) => {
      const b = await editableDraft(tx, id);
      const { tax } = await projectContext(tx, b.proposal.projectId);
      const already = new Set(b.lines.map((l) => l.itemId));
      const fresh = itemIds.filter((i) => !already.has(i));
      await insertLines(tx, studioId, b.version.id, await snapshotItems(tx, b.proposal.projectId, tax, fresh), b.lines.length);
      await touch(tx, id);
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result);
  })

  .patch("/:id/lines/:lineId", requirePermission("pricing.edit"), async (c) => {
    const { depositBps } = await body(c, proposalLinePatch);
    const id = c.req.param("id");
    const result = await inStudio(c, async (tx) => {
      const b = await editableDraft(tx, id);
      const [line] = await tx
        .update(proposalLines)
        .set({ depositBps })
        .where(and(eq(proposalLines.id, c.req.param("lineId")), eq(proposalLines.versionId, b.version.id)))
        .returning();
      if (!line) throw notFound("That line");
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result);
  })

  .delete("/:id/lines/:lineId", requirePermission("projects.edit"), async (c) => {
    const id = c.req.param("id");
    const result = await inStudio(c, async (tx) => {
      const b = await editableDraft(tx, id);
      const [line] = await tx
        .delete(proposalLines)
        .where(and(eq(proposalLines.id, c.req.param("lineId")), eq(proposalLines.versionId, b.version.id)))
        .returning();
      if (!line) throw notFound("That line");
      await touch(tx, id);
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result);
  })

  /** Re-prices a draft's lines from the items as they are now. */
  .post("/:id/refresh", requirePermission("projects.edit"), async (c) => {
    const id = c.req.param("id");
    const result = await inStudio(c, async (tx) => {
      const b = await editableDraft(tx, id);
      const { tax } = await projectContext(tx, b.proposal.projectId);
      const ids = b.lines.map((l) => l.itemId).filter((x): x is string => !!x);
      const fresh = new Map((await snapshotItems(tx, b.proposal.projectId, tax, ids)).map((s) => [s.itemId, s]));
      for (const l of b.lines) {
        const s = l.itemId ? fresh.get(l.itemId) : undefined;
        if (s) await tx.update(proposalLines).set({ ...s }).where(eq(proposalLines.id, l.id));
      }
      await touch(tx, id);
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result);
  })

  // ── Sending and versions ──
  .post("/:id/send", requirePermission("documents.send"), async (c) => {
    const id = c.req.param("id");
    const { studioId, userId } = c.var.session;
    const { appOrigin, linkSecret } = c.var.deps.config;
    const { result, mail } = await inStudio(c, async (tx) => {
      const b = await editableDraft(tx, id);
      if (b.lines.length === 0) throw new HttpError(400, "empty", "Add at least one item before sending.");
      const ctx = await projectContext(tx, b.proposal.projectId);
      if (!ctx.project.clientId) throw new HttpError(400, "no_client", "Choose a client for this project before sending.");
      if (!ctx.clientEmail) throw new HttpError(400, "no_client_email", `Add an email for ${ctx.clientName} before sending.`);

      // Earlier versions the client hasn't signed are replaced by this one.
      await tx
        .update(proposalVersions)
        .set({ status: "superseded" })
        .where(and(eq(proposalVersions.proposalId, id), eq(proposalVersions.status, "sent")));
      await tx
        .update(proposalVersions)
        .set({ status: "sent", sentAt: new Date(), clientName: ctx.clientName ?? "", clientEmail: ctx.clientEmail })
        .where(eq(proposalVersions.id, b.version.id));
      await advanceItems(tx, b.lines.map((l) => l.itemId), "proposed", ["draft", "rejected"]);
      await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, b.proposal.projectId));

      const link =
        (await activeLink(tx, id)) ??
        (await tx.insert(shareLinks).values({ studioId, audience: "client", proposalId: id, createdBy: userId }).returning())[0]!;
      await touch(tx, id);
      const t = totalsFor(b);
      await audit(tx, {
        studioId,
        actorUserId: userId,
        action: "proposal.sent",
        entityType: "proposal",
        entityId: id,
        after: { version: b.version.version, to: ctx.clientEmail, totalCents: t.totalCents },
      });
      const [studio] = await tx.select({ name: studios.name }).from(studios).where(eq(studios.id, studioId));
      const url = shareUrl(appOrigin, linkSecret, link.id);
      return {
        result: await detail(c, tx, id),
        mail: {
          to: ctx.clientEmail,
          subject: `${studio?.name ?? "Your designer"} sent you a proposal: ${b.proposal.title}`,
          text: `Hi ${ctx.clientName ?? ""},\n\n${studio?.name} sent ${formatProposalNumber(b.proposal.number)} for ${ctx.project.name}, totaling ${formatMoney(t.totalCents)}.\n\nReview, approve and pay the deposit here:\n${url}\n`,
        },
      };
    });
    await c.var.deps.mailer.send(mail).catch((err) => console.error("Proposal email failed", err));
    done(c, result.projectId, id);
    return c.json(result);
  })

  /** Starts a new draft from a sent version the client hasn't signed. */
  .post("/:id/versions", requirePermission("documents.send"), async (c) => {
    const id = c.req.param("id");
    const { studioId, userId } = c.var.session;
    const result = await inStudio(c, async (tx) => {
      const b = await bundleOr404(tx, id);
      if (b.version.status === "draft") throw new HttpError(409, "has_draft", "There's already a draft version to edit.");
      if (isSigned(b.version)) {
        throw new HttpError(409, "signed", "The client signed this proposal, so it's final. Start a new proposal for changes.");
      }
      const { tax } = await projectContext(tx, b.proposal.projectId);
      const [v] = await tx
        .insert(proposalVersions)
        .values({ studioId, proposalId: id, version: b.version.version + 1, depositBps: b.version.depositBps, intro: b.version.intro, terms: b.version.terms })
        .returning();
      const ids = b.lines.map((l) => l.itemId).filter((x): x is string => !!x);
      const overrides = new Map(b.lines.filter((l) => l.itemId).map((l) => [l.itemId!, l.depositBps]));
      await insertLines(tx, studioId, v!.id, await snapshotItems(tx, b.proposal.projectId, tax, ids), 0, overrides);
      await touch(tx, id);
      await audit(tx, { studioId, actorUserId: userId, action: "proposal.version_created", entityType: "proposal", entityId: id, after: { version: v!.version } });
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result, 201);
  })

  // ── Share link ──
  /** Revokes the current link and issues a new one. */
  .post("/:id/share", requirePermission("documents.send"), async (c) => {
    const id = c.req.param("id");
    const { studioId, userId } = c.var.session;
    const result = await inStudio(c, async (tx) => {
      const b = await bundleOr404(tx, id);
      if (!b.versions.some((v) => v.sentAt)) throw new HttpError(409, "not_sent", "Send the proposal first.");
      await tx.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.proposalId, id), isNull(shareLinks.revokedAt)));
      await tx.insert(shareLinks).values({ studioId, audience: "client", proposalId: id, createdBy: userId });
      await audit(tx, { studioId, actorUserId: userId, action: "share_link.replaced", entityType: "proposal", entityId: id });
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result);
  })

  .delete("/:id/share", requirePermission("documents.send"), async (c) => {
    const id = c.req.param("id");
    const { studioId, userId } = c.var.session;
    const result = await inStudio(c, async (tx) => {
      await tx.update(shareLinks).set({ revokedAt: new Date() }).where(and(eq(shareLinks.proposalId, id), isNull(shareLinks.revokedAt)));
      await audit(tx, { studioId, actorUserId: userId, action: "share_link.revoked", entityType: "proposal", entityId: id });
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result);
  })

  // ── Payments recorded by hand (check, wire) ──
  .post("/:id/payments", requirePermission("payments.manage"), async (c) => {
    const input = await body(c, manualPaymentInput);
    const id = c.req.param("id");
    const { studioId, userId } = c.var.session;
    const result = await inStudio(c, async (tx) => {
      const b = await bundleOr404(tx, id);
      if (!isSigned(b.version)) throw new HttpError(409, "not_signed", "Record deposits once the client has signed.");
      const due = totalsFor(b).balanceDueCents;
      if (input.amountCents > due) {
        throw new HttpError(400, "invalid_input", `That's more than the ${formatMoney(due)} still due.`, { amountCents: "More than the balance due" });
      }
      const [pay] = await tx
        .insert(payments)
        .values({
          studioId,
          projectId: b.proposal.projectId,
          versionId: b.version.id,
          amountCents: input.amountCents,
          method: input.method,
          status: "succeeded",
          note: input.note,
          recordedBy: userId,
          paidAt: new Date(),
        })
        .returning();
      await audit(tx, { studioId, actorUserId: userId, action: "payment.recorded", entityType: "payment", entityId: pay!.id, after: { proposalId: id, amountCents: input.amountCents, method: input.method } });
      await settleDeposit(tx, id, b.version.version);
      return detail(c, tx, id);
    });
    done(c, result.projectId, id);
    return c.json(result, 201);
  });

