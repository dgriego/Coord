import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { and, eq, gt, isNull } from "drizzle-orm";
import { acceptInviteInput, type InvitationPreview } from "@coord/shared";
import type { Env } from "../context.ts";
import { invitations, memberships, studios, users } from "../db/schema.ts";
import type { Db } from "../db/client.ts";
import { audit } from "../audit.ts";
import { body, HttpError } from "../http.ts";
import { hashPassword, hashToken } from "../auth/crypto.ts";
import { buildMe, createSession, loadSession, SESSION_COOKIE, switchStudio } from "../auth/sessions.ts";
import { setSessionCookie } from "./auth.ts";

// Public routes for someone holding an invitation link. They run on the owner
// connection because the visitor has no studio yet; every query is keyed by
// the token hash.

async function findOpenInvitation(sys: Db, token: string) {
  const [inv] = await sys
    .select({
      id: invitations.id,
      studioId: invitations.studioId,
      email: invitations.email,
      role: invitations.role,
      studioName: studios.name,
    })
    .from(invitations)
    .innerJoin(studios, eq(studios.id, invitations.studioId))
    .where(
      and(
        eq(invitations.tokenHash, hashToken(token)),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    );
  if (!inv) {
    throw new HttpError(404, "invitation_invalid", "This invitation link has expired or was cancelled. Ask for a new one.");
  }
  return inv;
}

export const invitationRoutes = new Hono<Env>()
  .get("/:token", async (c) => {
    const sys = c.var.deps.db.sys;
    const inv = await findOpenInvitation(sys, c.req.param("token"));
    const [user] = await sys.select({ id: users.id }).from(users).where(eq(users.email, inv.email));
    const preview: InvitationPreview = {
      studioName: inv.studioName,
      email: inv.email,
      role: inv.role,
      hasAccount: Boolean(user),
    };
    return c.json(preview);
  })

  .post("/accept", async (c) => {
    const input = await body(c, acceptInviteInput);
    const { db, bus, cache, config } = c.var.deps;
    const inv = await findOpenInvitation(db.sys, input.token);

    const [existing] = await db.sys.select({ id: users.id }).from(users).where(eq(users.email, inv.email));
    const cookie = getCookie(c, SESSION_COOKIE);
    const session = cookie ? await loadSession(db.sys, cookie) : null;

    let userId: string | undefined;
    let newUser: { name: string; passwordHash: string } | undefined;
    if (existing) {
      // Joining with an existing account requires being signed in as it, so a
      // forwarded link can't attach someone else's account to a studio.
      if (!session) throw new HttpError(401, "sign_in_required", `Sign in as ${inv.email} to accept this invitation.`);
      if (session.userId !== existing.id) {
        throw new HttpError(403, "wrong_account", `This invitation is for ${inv.email}. Sign in with that account.`);
      }
      userId = existing.id;
    } else {
      if (!input.name || !input.password) {
        throw new HttpError(400, "invalid_input", "Enter your name and a password to create your account.", {
          ...(input.name ? {} : { name: "Enter your name" }),
          ...(input.password ? {} : { password: "Use at least 10 characters" }),
        });
      }
      newUser = { name: input.name, passwordHash: await hashPassword(input.password, config.scrypt) };
    }

    userId = await db.sys.transaction(async (tx) => {
      if (newUser) {
        const [created] = await tx
          .insert(users)
          .values({ email: inv.email, ...newUser })
          .onConflictDoNothing()
          .returning({ id: users.id });
        if (!created) throw new HttpError(409, "email_taken", `An account for ${inv.email} already exists. Sign in to accept.`);
        userId = created.id;
      }
      const uid = userId!;
      await tx
        .insert(memberships)
        .values({ studioId: inv.studioId, userId: uid, role: inv.role })
        .onConflictDoNothing();
      // The acceptedAt guard makes a second, concurrent accept a no-op.
      const [marked] = await tx
        .update(invitations)
        .set({ acceptedAt: new Date() })
        .where(and(eq(invitations.id, inv.id), isNull(invitations.acceptedAt)))
        .returning({ id: invitations.id });
      if (!marked) throw new HttpError(409, "invitation_used", "This invitation has already been used.");
      await audit(tx, {
        studioId: inv.studioId,
        actorUserId: uid,
        action: "invitation.accepted",
        entityType: "invitation",
        entityId: inv.id,
        after: { email: inv.email, role: inv.role },
      });
      return uid;
    });

    // An existing account keeps its session and moves to the new studio. A new
    // account always gets its own session, replacing whoever was signed in.
    if (session && session.userId === userId) await switchStudio(db.sys, session, inv.studioId);
    else setSessionCookie(c, await createSession(db.sys, userId, inv.studioId));

    cache.bump(inv.studioId);
    bus.invalidate(inv.studioId, ["members"], ["invitations"], ["audit"]);
    return c.json(await buildMe(db.sys, { userId, studioId: inv.studioId, role: inv.role }));
  });
