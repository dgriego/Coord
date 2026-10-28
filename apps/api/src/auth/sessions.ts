import { and, asc, eq, gt, sql } from "drizzle-orm";
import { permissionKey, permissionsFor, type Me, type Role } from "@coord/shared";
import type { Db } from "../db/client.ts";
import { memberships, sessions, studios, users } from "../db/schema.ts";
import { hashToken, newToken } from "./crypto.ts";

export const SESSION_COOKIE = "sid";
export const SESSION_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export interface SessionInfo {
  sessionId: string;
  userId: string;
  studioId: string;
  role: Role;
}

export async function createSession(sys: Db, userId: string, studioId: string): Promise<string> {
  const { token, hash } = newToken();
  await sys.insert(sessions).values({
    id: hash,
    userId,
    studioId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * DAY),
  });
  return token;
}

export async function destroySession(sys: Db, token: string) {
  await sys.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/**
 * Resolves a cookie token to a session and the user's current role. If the
 * user was removed from the session's studio, it falls back to another studio
 * they belong to, or ends the session when there is none.
 */
export async function loadSession(sys: Db, token: string): Promise<SessionInfo | null> {
  const id = hashToken(token);
  const [row] = await sys
    .select({ userId: sessions.userId, studioId: sessions.studioId, expiresAt: sessions.expiresAt })
    .from(sessions)
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row) return null;

  const [membership] = await sys
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, row.userId), eq(memberships.studioId, row.studioId)));

  let studioId = row.studioId;
  let role = membership?.role;
  if (!role) {
    const [other] = await sys
      .select({ studioId: memberships.studioId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, row.userId))
      .orderBy(asc(memberships.createdAt))
      .limit(1);
    if (!other) {
      await sys.delete(sessions).where(eq(sessions.id, id));
      return null;
    }
    studioId = other.studioId;
    role = other.role;
    await sys.update(sessions).set({ studioId }).where(eq(sessions.id, id));
  }

  // Sliding expiry: extend once the session is past the halfway point.
  if (row.expiresAt.getTime() - Date.now() < (SESSION_DAYS / 2) * DAY) {
    await sys
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() + SESSION_DAYS * DAY) })
      .where(eq(sessions.id, id));
  }

  return { sessionId: id, userId: row.userId, studioId, role };
}

/** Moves the session to another of the user's studios. Returns the role there, or null. */
export async function switchStudio(sys: Db, session: SessionInfo, studioId: string): Promise<Role | null> {
  const [m] = await sys
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, session.userId), eq(memberships.studioId, studioId)));
  if (!m) return null;
  await sys.update(sessions).set({ studioId }).where(eq(sessions.id, session.sessionId));
  return m.role;
}

export async function buildMe(sys: Db, s: Pick<SessionInfo, "userId" | "studioId" | "role">): Promise<Me> {
  const [user] = await sys
    .select({ id: users.id, email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, s.userId));
  const all = await sys
    .select({ id: studios.id, name: studios.name, role: memberships.role })
    .from(memberships)
    .innerJoin(studios, eq(studios.id, memberships.studioId))
    .where(eq(memberships.userId, s.userId))
    .orderBy(asc(sql`lower(${studios.name})`));
  const studio = all.find((x) => x.id === s.studioId);
  if (!user || !studio) throw new Error("Session points at a missing user or studio");

  return {
    user,
    studio: { id: studio.id, name: studio.name },
    role: s.role,
    permissions: permissionsFor(s.role),
    cacheKey: `${user.id}:${studio.id}:${permissionKey(s.role)}`,
    studios: all,
  };
}
