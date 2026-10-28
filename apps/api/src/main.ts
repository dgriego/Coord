import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/client.ts";
import { EventBus } from "./events.ts";
import { StudioCache } from "./cache.ts";
import { RateLimiter } from "./rate-limit.ts";
import { mailerFromEnv } from "./mailer.ts";
import { DEV_LINK_SECRET } from "./proposals/model.ts";
import { SimulatedProvider, StripeProvider, type PaymentProvider } from "./payments/provider.ts";

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 8790);
const appOrigin = process.env.APP_ORIGIN ?? (production ? `http://localhost:${port}` : "http://localhost:5173");

// Without DATABASE_URL, embedded Postgres keeps its files here. PGlite hangs
// rather than failing when the parent folder is missing, so create it.
const dataDir = process.env.PGLITE_DIR ?? resolve(process.cwd(), ".data/pg");
if (!process.env.DATABASE_URL) mkdirSync(dirname(dataDir), { recursive: true });
const db = await openDatabase({ url: process.env.DATABASE_URL, dataDir });

// Share links are signed with LINK_SECRET; a fixed value is fine only for local dev.
const linkSecret = process.env.LINK_SECRET ?? (production ? undefined : DEV_LINK_SECRET);
if (!linkSecret) throw new Error("Set LINK_SECRET (a long random string) to sign client share links.");

// Real Stripe with keys; simulated checkout in local dev; none in production without keys.
const payments: PaymentProvider | null =
  process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET
    ? new StripeProvider(process.env.STRIPE_SECRET_KEY, process.env.STRIPE_WEBHOOK_SECRET)
    : production
      ? null
      : new SimulatedProvider(appOrigin);

const app = createApp({
  db,
  bus: new EventBus(),
  cache: new StudioCache(),
  loginLimiter: new RateLimiter(10, 15 * 60 * 1000),
  mailer: mailerFromEnv(process.env),
  payments,
  config: { appOrigin, secureCookies: appOrigin.startsWith("https://"), linkSecret, exposeDevCodes: !production },
});

// In production the API also serves the built web app.
const webDist = process.env.WEB_DIST ?? resolve(process.cwd(), "../web/dist");
if (production && existsSync(webDist)) {
  const indexHtml = readFileSync(resolve(webDist, "index.html"), "utf8");
  app.use(
    "/assets/*",
    serveStatic({
      root: webDist,
      // Hashed file names, so they can be cached forever.
      onFound: (_path, c) => c.header("Cache-Control", "public, max-age=31536000, immutable"),
    }),
  );
  app.use("*", serveStatic({ root: webDist }));
  app.get("*", (c) => {
    c.header("Cache-Control", "no-cache");
    return c.html(indexHtml);
  });
}

const server = serve({ fetch: app.fetch, port }, () => {
  console.log(`API listening on http://localhost:${port} (web origin ${appOrigin})`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    void db.close().then(() => process.exit(0));
  });
}
