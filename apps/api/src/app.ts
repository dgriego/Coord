import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ApiError } from "@coord/shared";
import { requireSession, type Deps, type Env } from "./context.ts";
import { HttpError } from "./http.ts";
import { authRoutes, meRoutes } from "./routes/auth.ts";
import { teamRoutes } from "./routes/team.ts";
import { invitationRoutes } from "./routes/invitations.ts";
import { clientRoutes, vendorRoutes } from "./routes/directory.ts";
import { itemRoutes, projectRoutes, roomRoutes } from "./routes/projects.ts";
import { clipRoutes } from "./routes/clip.ts";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function createApp(deps: Deps) {
  const app = new Hono<Env>();

  app.use("*", async (c, next) => {
    c.set("deps", deps);
    await next();
  });

  // CSRF: the API has no CORS, and writes must be JSON from our own origin.
  // A cross-site form can't send application/json without a preflight, and
  // browsers send Origin on every cross-origin write.
  app.use("/api/*", async (c, next) => {
    if (MUTATING.has(c.req.method)) {
      // Same-host requests pass too, so preview deployments on their own URLs work.
      const origin = c.req.header("origin");
      if (origin && origin !== deps.config.appOrigin && hostOf(origin) !== c.req.header("host")) {
        throw new HttpError(403, "bad_origin", "Requests must come from the app.");
      }
      const type = c.req.header("content-type") ?? "";
      const hasBody = c.req.header("content-length") !== "0" && c.req.method !== "DELETE";
      if (hasBody && !type.startsWith("application/json")) {
        throw new HttpError(415, "json_required", "Send requests as application/json.");
      }
    }
    await next();
  });

  app.get("/api/health", (c) => c.json({ ok: true }));
  app.route("/api/auth", authRoutes);
  app.route("/api/me", meRoutes);
  app.route("/api/studio", teamRoutes);
  app.route("/api/invitations", invitationRoutes);
  app.route("/api/clients", clientRoutes);
  app.route("/api/vendors", vendorRoutes);
  app.route("/api/projects", projectRoutes);
  app.route("/api/rooms", roomRoutes);
  app.route("/api/items", itemRoutes);
  app.route("/api/clip", clipRoutes);

  // Live invalidations for the signed-in user's current studio (PLAN.md 9.2).
  app.get("/api/events", requireSession, (c) => {
    const { studioId } = c.var.session;
    return streamSSE(c, async (stream) => {
      const unsubscribe = deps.bus.subscribe(studioId, (event) => {
        void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
      });
      stream.onAbort(unsubscribe);
      await stream.writeSSE({ event: "ready", data: "{}" });
      // Heartbeat keeps proxies from closing an idle stream.
      while (!stream.aborted) {
        await stream.sleep(25_000);
        if (!stream.aborted) await stream.writeSSE({ event: "ping", data: "{}" });
      }
      unsubscribe();
    });
  });

  app.notFound((c) => c.json<ApiError>({ error: { code: "not_found", message: "No such endpoint." } }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json<ApiError>({ error: { code: err.code, message: err.message, fields: err.fields } }, err.status);
    }
    console.error(err);
    return c.json<ApiError>(
      { error: { code: "server_error", message: "Something went wrong on our side. Try again in a moment." } },
      500,
    );
  });

  return app;
}
