import type { Context } from "hono";
import type { Deps, Env } from "../context.ts";
import type { Tx } from "../db/client.ts";

/** Bumps the studio's cache version and tells open clients what to refetch. */
export function changed(c: Context<Env>, ...keys: string[][]) {
  changedFor(c.var.deps, c.var.session.studioId, ...keys);
}

/** Like `changed`, for writes with no signed-in member (share links, webhooks). */
export function changedFor(deps: Deps, studioId: string, ...keys: string[][]) {
  deps.cache.bump(studioId);
  deps.bus.invalidate(studioId, ...keys, ["audit"]);
}

/** Runs `fn` scoped to the signed-in user's studio (row-level security). */
export function inStudio<T>(c: Context<Env>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return c.var.deps.db.withStudio(c.var.session.studioId, fn);
}

export const iso = (d: Date) => d.toISOString();
