import { Hono, type Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { getConnInfo } from "@hono/node-server/conninfo";
import { randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import {
  formatMoney,
  formatProposalNumber,
  shareCodeInput,
  shareDecisionInput,
  shareSignInput,
  type SharedProposal,
} from "@coord/shared";
import type { Deps, Env } from "../context.ts";
import type { Tx } from "../db/client.ts";
import { payments, projects, proposalLines, proposals, proposalVersions, shareCodes, shareLinks, shareSessions, studios } from "../db/schema.ts";
import { audit } from "../audit.ts";
import { body, HttpError } from "../http.ts";
import { hashToken, newToken } from "../auth/crypto.ts";
import { RateLimiter } from "../rate-limit.ts";
import {
  advanceItems,
  documentHash,
  isSigned,
  loadBundle,
  maskEmail,
  parseShareToken,
  serializeShared,
  settleDeposit,
  totalsFor,
  type Bundle,
} from "../proposals/model.ts";
import { renderProposalPage } from "../proposals/page.ts";
import { changedFor } from "./helpers.ts";

// Public routes for a client holding a share link (PLAN.md D6). The link
// itself lets them read; approving, signing and paying need a code sent to
// the client's email. The link row is found on the owner connection (the
// visitor has no studio), then everything runs under that studio's RLS scope.

const SHARE_COOKIE = "coord_share";
const CODE_MINUTES = 15;
const SESSION_HOURS = 2;
const MAX_CODE_ATTEMPTS = 5;
const codeLimiter = new RateLimiter(5, 15 * 60 * 1000);

interface Link {
  id: string;
  studioId: string;
  proposalId: string;
}

async function resolveLink(deps: Deps, token: string): Promise<Link> {
  const id = parseShareToken(deps.config.linkSecret, token);
  const [link] = id
    ? await deps.db.sys
        .select({ id: shareLinks.id, studioId: shareLinks.studioId, proposalId: shareLinks.proposalId, revokedAt: shareLinks.revokedAt })
        .from(shareLinks)
        .where(eq(shareLinks.id, id))
    : [];
  if (!link || link.revokedAt || !link.proposalId) {
    throw new HttpError(404, "link_invalid", "This link is no longer active. Ask your designer for a new one.");
  }
  return { id: link.id, studioId: link.studioId, proposalId: link.proposalId };
}

/** The newest version the client was sent. Drafts are never visible through a link. */
async function sentBundle(tx: Tx, proposalId: string): Promise<Bundle> {
  const versions = await tx
    .select({ version: proposalVersions.version })
    .from(proposalVersions)
    .where(eq(proposalVersions.proposalId, proposalId))
    .orderBy(desc(proposalVersions.version));
  for (const { version } of versions) {
    const b = await loadBundle(tx, proposalId, version);
    if (b?.version.sentAt) return b;
  }
  throw new HttpError(404, "link_invalid", "This link is no longer active. Ask your designer for a new one.");
}

async function verifiedEmail(c: Context<Env>, tx: Tx, link: Link): Promise<string | null> {
  const token = getCookie(c, SHARE_COOKIE);
  if (!token) return null;
  const [s] = await tx
    .select({ email: shareSessions.email })
    .from(shareSessions)
    .where(and(eq(shareSessions.id, hashToken(token)), eq(shareSessions.linkId, link.id), gt(shareSessions.expiresAt, new Date())));
  return s?.email ?? null;
}

async function sharedView(c: Context<Env>, tx: Tx, link: Link, b?: Bundle): Promise<SharedProposal> {
  const bundle = b ?? (await sentBundle(tx, link.proposalId));
  const [studio] = await tx.select().from(studios).where(eq(studios.id, link.studioId));
  const [project] = await tx.select({ name: projects.name, address: projects.address }).from(projects).where(eq(projects.id, bundle.proposal.projectId));
  const email = await verifiedEmail(c, tx, link);
  const { payments: provider } = c.var.deps;
  return serializeShared(bundle, {
    studio: { name: studio!.name, address: studio!.address, email: studio!.email, phone: studio!.phone },
    project: { name: project?.name ?? "", address: project?.address ?? "" },
    // A session for an email the version wasn't sent to (the project's client changed) doesn't count.
    verified: email !== null && email === bundle.version.clientEmail,
    paymentMode: provider && studio!.stripeAccountId && studio!.stripeChargesEnabled ? provider.mode : null,
  });
}

/** For actions: the link, the version and the verified email, or a 403. */
async function requireVerified(c: Context<Env>, tx: Tx, link: Link) {
  const b = await sentBundle(tx, link.proposalId);
  const email = await verifiedEmail(c, tx, link);
  if (!email || email !== b.version.clientEmail) throw new HttpError(403, "verify_required", "Confirm your email to continue.");
  return { b, email };
}

function requireOpen(b: Bundle) {
  if (b.version.status !== "sent" || isSigned(b.version)) {
    throw new HttpError(409, "closed", "This proposal can't be changed anymore. Reload to see the latest.");
  }
}

function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || c.req.header("x-real-ip");
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown"; // No socket, e.g. in tests.
  }
}

function linkChanged(deps: Deps, link: Link, projectId: string) {
  changedFor(deps, link.studioId, ["proposal", link.proposalId], ["proposals", projectId], ["project", projectId], ["projects"]);
}

/** Share pages carry client prices: never cached by shared caches (PLAN.md 9.3). */
function privateHeaders(c: Context) {
  c.header("Cache-Control", "private, no-store");
  c.header("Referrer-Policy", "no-referrer");
  c.header("X-Robots-Tag", "noindex");
}

export const sharePageRoutes = new Hono<Env>().get("/:token", async (c) => {
  privateHeaders(c);
  const { deps } = c.var;
  let link: Link;
  try {
    link = await resolveLink(deps, c.req.param("token"));
  } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    return c.html(
      `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Link not active</title><body style="font:16px system-ui;max-width:520px;margin:15vh auto;padding:16px"><h1>This link isn't active</h1><p>Ask your designer for a new one.</p></body>`,
      404,
    );
  }
  const view = await deps.db.withStudio(link.studioId, async (tx) => {
    await tx.update(shareLinks).set({ lastViewedAt: new Date() }).where(eq(shareLinks.id, link.id));
    return sharedView(c, tx, link);
  });
  const paid = c.req.query("paid");
  return c.html(renderProposalPage(view, c.req.param("token"), paid === "1" ? "paid" : paid === "0" ? "canceled" : undefined));
});

export const shareApiRoutes = new Hono<Env>()
  .use(async (c, next) => {
    privateHeaders(c);
    await next();
  })

  .get("/:token", async (c) => {
    const link = await resolveLink(c.var.deps, c.req.param("token"));
    return c.json(await c.var.deps.db.withStudio(link.studioId, (tx) => sharedView(c, tx, link)));
  })

  .post("/:token/code", async (c) => {
    const { deps } = c.var;
    const link = await resolveLink(deps, c.req.param("token"));
    if (!codeLimiter.take(link.id)) throw new HttpError(429, "too_many_attempts", "Too many codes requested. Wait a few minutes and try again.");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const { email, mail } = await deps.db.withStudio(link.studioId, async (tx) => {
      const b = await sentBundle(tx, link.proposalId);
      const to = b.version.clientEmail;
      await tx.insert(shareCodes).values({
        studioId: link.studioId,
        linkId: link.id,
        email: to,
        codeHash: hashToken(`${link.id}:${code}`),
        expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
      });
      const [studio] = await tx.select({ name: studios.name }).from(studios).where(eq(studios.id, link.studioId));
      return {
        email: to,
        mail: {
          to,
          subject: `${code} is your code for ${studio?.name ?? "your designer"}`,
          text: `Your code to approve ${formatProposalNumber(b.proposal.number)} is ${code}. It expires in ${CODE_MINUTES} minutes.\n\nIf you didn't ask for it, ignore this email.`,
        },
      };
    });
    await deps.mailer.send(mail);
    return c.json({ maskedEmail: maskEmail(email), ...(deps.config.exposeDevCodes ? { devCode: code } : {}) });
  })

  .post("/:token/verify", async (c) => {
    const { code } = await body(c, shareCodeInput);
    const { deps } = c.var;
    const link = await resolveLink(deps, c.req.param("token"));
    const token = await deps.db.withStudio(link.studioId, async (tx) => {
      const [row] = await tx
        .select()
        .from(shareCodes)
        .where(and(eq(shareCodes.linkId, link.id), isNull(shareCodes.usedAt), gt(shareCodes.expiresAt, new Date())))
        .orderBy(desc(shareCodes.createdAt))
        .limit(1);
      if (!row || row.attempts >= MAX_CODE_ATTEMPTS) return { error: "expired" as const };
      if (row.codeHash !== hashToken(`${link.id}:${code}`)) {
        await tx.update(shareCodes).set({ attempts: row.attempts + 1 }).where(eq(shareCodes.id, row.id));
        return { error: "wrong" as const };
      }
      await tx.update(shareCodes).set({ usedAt: new Date() }).where(eq(shareCodes.id, row.id));
      const session = newToken();
      await tx.insert(shareSessions).values({
        id: session.hash,
        studioId: link.studioId,
        linkId: link.id,
        email: row.email,
        expiresAt: new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000),
      });
      return { token: session.token };
    });
    if ("error" in token) {
      throw token.error === "wrong"
        ? new HttpError(400, "invalid_input", "That code isn't right. Check the email and try again.", { code: "Wrong code" })
        : new HttpError(400, "code_expired", "That code expired. Ask for a new one.");
    }
    setCookie(c, SHARE_COOKIE, token.token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: deps.config.secureCookies,
      path: "/",
      maxAge: SESSION_HOURS * 60 * 60,
    });
    return c.json({ ok: true });
  })

  .post("/:token/lines/:lineId", async (c) => {
    const input = await body(c, shareDecisionInput);
    const { deps } = c.var;
    const link = await resolveLink(deps, c.req.param("token"));
    const { view, projectId } = await deps.db.withStudio(link.studioId, async (tx) => {
      const { b, email } = await requireVerified(c, tx, link);
      requireOpen(b);
      const [line] = await tx
        .update(proposalLines)
        .set({ decision: input.decision, clientNote: input.note, decidedAt: input.decision === "pending" ? null : new Date() })
        .where(and(eq(proposalLines.id, c.req.param("lineId")), eq(proposalLines.versionId, b.version.id)))
        .returning();
      if (!line) throw new HttpError(404, "not_found", "That item isn't on this proposal.");
      await audit(tx, {
        studioId: link.studioId,
        actorUserId: null,
        action: "proposal.line_decided",
        entityType: "proposal",
        entityId: link.proposalId,
        after: { line: line.name, decision: input.decision, by: email },
      });
      return { view: await sharedView(c, tx, link), projectId: b.proposal.projectId };
    });
    linkChanged(deps, link, projectId);
    return c.json(view);
  })

  .post("/:token/sign", async (c) => {
    const input = await body(c, shareSignInput);
    const { deps } = c.var;
    const link = await resolveLink(deps, c.req.param("token"));
    const { view, projectId } = await deps.db.withStudio(link.studioId, async (tx) => {
      const { b, email } = await requireVerified(c, tx, link);
      requireOpen(b);
      if (b.lines.some((l) => l.decision === "pending")) throw new HttpError(400, "undecided", "Approve or decline every item before signing.");
      const approved = b.lines.filter((l) => l.decision === "approved");
      if (approved.length === 0) throw new HttpError(400, "none_approved", "Approve at least one item to sign.");

      const hash = documentHash(b, { name: input.name, email });
      const status = approved.length === b.lines.length ? "approved" : "partially_approved";
      await tx
        .update(proposalVersions)
        .set({
          status,
          signedName: input.name,
          signedEmail: email,
          signedAt: new Date(),
          signedIp: clientIp(c),
          signedUserAgent: (c.req.header("user-agent") ?? "").slice(0, 400),
          signedHash: hash,
        })
        .where(eq(proposalVersions.id, b.version.id));
      await advanceItems(tx, approved.map((l) => l.itemId), "approved", ["draft", "proposed", "rejected"]);
      await advanceItems(tx, b.lines.filter((l) => l.decision === "rejected").map((l) => l.itemId), "rejected", ["draft", "proposed"]);
      await settleDeposit(tx, link.proposalId, b.version.version);
      await tx.update(proposals).set({ updatedAt: new Date() }).where(eq(proposals.id, link.proposalId));
      const signedBundle = (await loadBundle(tx, link.proposalId, b.version.version))!;
      await audit(tx, {
        studioId: link.studioId,
        actorUserId: null,
        action: "proposal.signed",
        entityType: "proposal",
        entityId: link.proposalId,
        after: { version: b.version.version, name: input.name, email, ip: clientIp(c), documentHash: hash, approvedCents: totalsFor(signedBundle).approvedCents },
      });
      return { view: await sharedView(c, tx, link, signedBundle), projectId: b.proposal.projectId };
    });
    linkChanged(deps, link, projectId);
    return c.json(view);
  })

  .post("/:token/checkout", async (c) => {
    const { deps } = c.var;
    const provider = deps.payments;
    const link = await resolveLink(deps, c.req.param("token"));
    const token = c.req.param("token");
    const { url, projectId } = await deps.db.withStudio(link.studioId, async (tx) => {
      const { b, email } = await requireVerified(c, tx, link);
      if (!isSigned(b.version)) throw new HttpError(409, "not_signed", "Sign the proposal before paying the deposit.");
      const [studio] = await tx.select().from(studios).where(eq(studios.id, link.studioId));
      if (!provider || !studio?.stripeAccountId || !studio.stripeChargesEnabled) {
        throw new HttpError(409, "payments_unavailable", `${studio?.name ?? "Your designer"} isn't set up for online payments yet.`);
      }
      const due = totalsFor(b).balanceDueCents;
      if (due <= 0) throw new HttpError(409, "nothing_due", "There's no deposit due right now.");

      // One open checkout at a time, so two tabs can't both collect the deposit.
      await tx
        .update(payments)
        .set({ status: "canceled" })
        .where(and(eq(payments.versionId, b.version.id), eq(payments.status, "pending")));
      const [pay] = await tx
        .insert(payments)
        .values({ studioId: link.studioId, projectId: b.proposal.projectId, versionId: b.version.id, amountCents: due, status: "pending" })
        .returning();
      const back = `${deps.config.appOrigin}/p/${token}`;
      const session = await provider.createCheckout(studio.stripeAccountId, {
        amountCents: due,
        description: `Deposit for ${formatProposalNumber(b.proposal.number)}: ${b.proposal.title} (${formatMoney(due)})`,
        paymentId: pay!.id,
        studioId: link.studioId,
        customerEmail: email,
        successUrl: `${back}?paid=1`,
        cancelUrl: `${back}?paid=0`,
      });
      await tx.update(payments).set({ providerSessionId: session.id }).where(eq(payments.id, pay!.id));
      return { url: session.url, projectId: b.proposal.projectId };
    });
    linkChanged(deps, link, projectId);
    return c.json({ url });
  });
