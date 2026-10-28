import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import { can, type Permission } from "@coord/shared";
import type { Database } from "./db/client.ts";
import type { Bus } from "./events.ts";
import type { StudioCache } from "./cache.ts";
import type { RateLimiter } from "./rate-limit.ts";
import type { ScryptCost } from "./auth/crypto.ts";
import { loadSession, SESSION_COOKIE, type SessionInfo } from "./auth/sessions.ts";
import { forbidden, HttpError } from "./http.ts";

export interface Config {
  /** Origin of the web app, used for CSRF checks and links in invitations. */
  appOrigin: string;
  secureCookies: boolean;
  scrypt?: ScryptCost;
}

export interface Deps {
  db: Database;
  bus: Bus;
  cache: StudioCache;
  loginLimiter: RateLimiter;
  config: Config;
}

export type Env = {
  Variables: {
    deps: Deps;
    session: SessionInfo;
  };
};

/** Requires a signed-in user and puts their session on the context. */
export const requireSession = createMiddleware<Env>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const session = token ? await loadSession(c.var.deps.db.sys, token) : null;
  if (!session) throw new HttpError(401, "unauthenticated", "Sign in to continue.");
  c.set("session", session);
  await next();
});

export const requirePermission = (permission: Permission) =>
  createMiddleware<Env>(async (c, next) => {
    if (!can(c.var.session.role, permission)) throw forbidden();
    await next();
  });
