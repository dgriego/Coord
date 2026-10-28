import { Hono } from "hono";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  canAssignRole,
  changeRoleInput,
  inviteInput,
  type AuditEntry,
  type CreatedInvitation,
  type Invitation,
  type Member,
  type Role,
} from "@coord/shared";
import { requirePermission, requireSession, type Env } from "../context.ts";
import { auditLog, invitations, memberships, users } from "../db/schema.ts";
import type { Tx } from "../db/client.ts";
import { audit } from "../audit.ts";
import { body, forbidden, HttpError, notFound } from "../http.ts";
import { newToken } from "../auth/crypto.ts";
import { changed } from "./helpers.ts";

const INVITE_DAYS = 7;

async function ownerCount(tx: Tx): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(eq(memberships.role, "owner"));
  return r?.n ?? 0;
}

/** Owners can only be changed or removed by owners, and never the last one. */
async function assertCanChange(tx: Tx, actor: Role, current: Role, next: Role | null) {
  if (current === "owner" && actor !== "owner") throw forbidden("Only an owner can change another owner.");
  if (next && !canAssignRole(actor, next)) throw forbidden("Your role can't assign that role.");
  if (current === "owner" && next !== "owner" && (await ownerCount(tx)) <= 1) {
    throw new HttpError(409, "last_owner", "A studio needs at least one owner. Make someone else an owner first.");
  }
}

export const teamRoutes = new Hono<Env>()
  .use(requireSession)

  .get("/members", async (c) => {
    const { studioId, role } = c.var.session;
    const { db, cache } = c.var.deps;
    const members = await cache.get(studioId, role, "members", () =>
      db.withStudio(studioId, (tx) =>
        tx
          .select({
            userId: users.id,
            name: users.name,
            email: users.email,
            role: memberships.role,
            joinedAt: memberships.createdAt,
          })
          .from(memberships)
          .innerJoin(users, eq(users.id, memberships.userId))
          .orderBy(asc(sql`lower(${users.name})`)),
      ),
    );
    return c.json(members.map((m): Member => ({ ...m, joinedAt: m.joinedAt.toISOString() })));
  })

  .patch("/members/:userId", requirePermission("team.manage"), async (c) => {
    const { role: next } = await body(c, changeRoleInput);
    const { studioId, userId: actorId, role: actor } = c.var.session;
    const userId = c.req.param("userId");

    await c.var.deps.db.withStudio(studioId, async (tx) => {
      const [m] = await tx.select({ role: memberships.role }).from(memberships).where(eq(memberships.userId, userId));
      if (!m) throw notFound("That team member");
      if (m.role === next) return;
      await assertCanChange(tx, actor, m.role, next);
      await tx.update(memberships).set({ role: next }).where(eq(memberships.userId, userId));
      await audit(tx, {
        studioId,
        actorUserId: actorId,
        action: "member.role_changed",
        entityType: "user",
        entityId: userId,
        before: { role: m.role },
        after: { role: next },
      });
    });
    changed(c, ["members"], ["me"]);
    return c.body(null, 204);
  })

  .delete("/members/:userId", requirePermission("team.manage"), async (c) => {
    const { studioId, userId: actorId, role: actor } = c.var.session;
    const userId = c.req.param("userId");

    await c.var.deps.db.withStudio(studioId, async (tx) => {
      const [m] = await tx
        .select({ role: memberships.role, email: users.email })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.userId, userId));
      if (!m) throw notFound("That team member");
      await assertCanChange(tx, actor, m.role, null);
      await tx.delete(memberships).where(eq(memberships.userId, userId));
      await audit(tx, {
        studioId,
        actorUserId: actorId,
        action: "member.removed",
        entityType: "user",
        entityId: userId,
        before: { role: m.role, email: m.email },
      });
    });
    changed(c, ["members"], ["me"]);
    return c.body(null, 204);
  })

  .get("/invitations", requirePermission("team.manage"), async (c) => {
    const { studioId } = c.var.session;
    const list = await c.var.deps.db.withStudio(studioId, (tx) =>
      tx
        .select({
          id: invitations.id,
          email: invitations.email,
          role: invitations.role,
          invitedBy: sql<string>`coalesce(${users.name}, 'Former member')`,
          createdAt: invitations.createdAt,
          expiresAt: invitations.expiresAt,
        })
        .from(invitations)
        .leftJoin(users, eq(users.id, invitations.invitedBy))
        .where(and(isNull(invitations.acceptedAt), isNull(invitations.revokedAt), gt(invitations.expiresAt, new Date())))
        .orderBy(desc(invitations.createdAt)),
    );
    return c.json(
      list.map(
        (i): Invitation => ({ ...i, createdAt: i.createdAt.toISOString(), expiresAt: i.expiresAt.toISOString() }),
      ),
    );
  })

  .post("/invitations", requirePermission("team.manage"), async (c) => {
    const input = await body(c, inviteInput);
    const { studioId, userId: actorId, role: actor } = c.var.session;
    if (!canAssignRole(actor, input.role)) throw forbidden("Your role can't invite someone as that role.");
    const { token, hash } = newToken();

    const created = await c.var.deps.db.withStudio(studioId, async (tx) => {
      const [member] = await tx
        .select({ id: users.id })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(users.email, input.email));
      if (member) {
        throw new HttpError(409, "already_member", "This person is already on the team.", { email: "Already a member" });
      }
      // Re-inviting replaces any pending invitation for the same email.
      await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.email, input.email), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)));
      const [inv] = await tx
        .insert(invitations)
        .values({
          studioId,
          email: input.email,
          role: input.role,
          tokenHash: hash,
          invitedBy: actorId,
          expiresAt: new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000),
        })
        .returning();
      await audit(tx, {
        studioId,
        actorUserId: actorId,
        action: "invitation.created",
        entityType: "invitation",
        entityId: inv!.id,
        after: { email: input.email, role: input.role },
      });
      const [me] = await tx.select({ name: users.name }).from(users).where(eq(users.id, actorId));
      return { inv: inv!, invitedBy: me?.name ?? "" };
    });

    changed(c, ["invitations"]);
    const result: CreatedInvitation = {
      id: created.inv.id,
      email: created.inv.email,
      role: created.inv.role,
      invitedBy: created.invitedBy,
      createdAt: created.inv.createdAt.toISOString(),
      expiresAt: created.inv.expiresAt.toISOString(),
      acceptUrl: `${c.var.deps.config.appOrigin}/invite/${token}`,
    };
    return c.json(result, 201);
  })

  .delete("/invitations/:id", requirePermission("team.manage"), async (c) => {
    const { studioId, userId: actorId } = c.var.session;
    const id = c.req.param("id");
    await c.var.deps.db.withStudio(studioId, async (tx) => {
      const [inv] = await tx
        .update(invitations)
        .set({ revokedAt: new Date() })
        .where(and(eq(invitations.id, id), isNull(invitations.acceptedAt), isNull(invitations.revokedAt)))
        .returning({ email: invitations.email });
      if (!inv) throw notFound("That invitation");
      await audit(tx, {
        studioId,
        actorUserId: actorId,
        action: "invitation.revoked",
        entityType: "invitation",
        entityId: id,
        before: { email: inv.email },
      });
    });
    changed(c, ["invitations"]);
    return c.body(null, 204);
  })

  .get("/audit", requirePermission("team.manage"), async (c) => {
    const { studioId } = c.var.session;
    const list = await c.var.deps.db.withStudio(studioId, (tx) =>
      tx
        .select({
          id: auditLog.id,
          action: auditLog.action,
          entityType: auditLog.entityType,
          entityId: auditLog.entityId,
          actorName: users.name,
          createdAt: auditLog.createdAt,
          before: auditLog.before,
          after: auditLog.after,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorUserId))
        .orderBy(desc(auditLog.createdAt))
        .limit(100),
    );
    return c.json(list.map((a): AuditEntry => ({ ...a, createdAt: a.createdAt.toISOString() })));
  });
