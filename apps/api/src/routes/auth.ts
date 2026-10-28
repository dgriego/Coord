import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import { loginInput, signupInput, switchStudioInput } from "@coord/shared";
import type { Env } from "../context.ts";
import { requireSession } from "../context.ts";
import { memberships, studios, users } from "../db/schema.ts";
import { audit } from "../audit.ts";
import { body, HttpError } from "../http.ts";
import { hashPassword, verifyPassword } from "../auth/crypto.ts";
import {
  buildMe,
  createSession,
  destroySession,
  SESSION_COOKIE,
  SESSION_DAYS,
  switchStudio,
} from "../auth/sessions.ts";

export function setSessionCookie(c: Context<Env>, token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: c.var.deps.config.secureCookies,
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

// Compared against when the email is unknown, so response time doesn't reveal
// which emails have accounts.
let dummyHash: Promise<string> | undefined;

export const authRoutes = new Hono<Env>()
  .post("/signup", async (c) => {
    const input = await body(c, signupInput);
    const { db, config } = c.var.deps;
    const passwordHash = await hashPassword(input.password, config.scrypt);

    const result = await db.sys.transaction(async (tx) => {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.email, input.email));
      if (existing) {
        throw new HttpError(409, "email_taken", "An account with this email already exists. Sign in instead.", {
          email: "Already registered",
        });
      }
      const [user] = await tx
        .insert(users)
        .values({ email: input.email, name: input.name, passwordHash })
        .returning({ id: users.id });
      const [studio] = await tx.insert(studios).values({ name: input.studioName }).returning({ id: studios.id });
      await tx.insert(memberships).values({ studioId: studio!.id, userId: user!.id, role: "owner" });
      await audit(tx, {
        studioId: studio!.id,
        actorUserId: user!.id,
        action: "studio.created",
        entityType: "studio",
        entityId: studio!.id,
        after: { name: input.studioName },
      });
      return { userId: user!.id, studioId: studio!.id };
    });

    setSessionCookie(c, await createSession(db.sys, result.userId, result.studioId));
    return c.json(await buildMe(db.sys, { ...result, role: "owner" }), 201);
  })

  .post("/login", async (c) => {
    const input = await body(c, loginInput);
    const { db, loginLimiter, config } = c.var.deps;
    if (!loginLimiter.take(`login:${input.email}`)) {
      throw new HttpError(429, "too_many_attempts", "Too many sign-in attempts. Wait 15 minutes and try again.");
    }

    const [user] = await db.sys
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, input.email));
    dummyHash ??= hashPassword("not-a-real-password", config.scrypt);
    const ok = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) throw new HttpError(401, "invalid_credentials", "That email and password don't match.");

    const [membership] = await db.sys
      .select({ studioId: memberships.studioId, role: memberships.role })
      .from(memberships)
      .where(eq(memberships.userId, user.id))
      .limit(1);
    if (!membership) {
      throw new HttpError(403, "no_studio", "This account isn't part of any studio. Ask for a new invitation.");
    }

    loginLimiter.reset(`login:${input.email}`);
    setSessionCookie(c, await createSession(db.sys, user.id, membership.studioId));
    return c.json(await buildMe(db.sys, { userId: user.id, ...membership }));
  })

  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await destroySession(c.var.deps.db.sys, token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  });

export const meRoutes = new Hono<Env>()
  .use(requireSession)
  .get("/", async (c) => c.json(await buildMe(c.var.deps.db.sys, c.var.session)))
  .post("/studio", async (c) => {
    const { studioId } = await body(c, switchStudioInput);
    const sys = c.var.deps.db.sys;
    const role = await switchStudio(sys, c.var.session, studioId);
    if (!role) throw new HttpError(403, "not_a_member", "You aren't a member of that studio.");
    return c.json(await buildMe(sys, { userId: c.var.session.userId, studioId, role }));
  });
