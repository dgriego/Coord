import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/client.ts";
import { EventBus } from "./events.ts";
import { StudioCache } from "./cache.ts";
import { RateLimiter } from "./rate-limit.ts";

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? 8790);
const appOrigin = process.env.APP_ORIGIN ?? (production ? `http://localhost:${port}` : "http://localhost:5173");

// Without DATABASE_URL, embedded Postgres keeps its files here. PGlite hangs
// rather than failing when the parent folder is missing, so create it.
const dataDir = process.env.PGLITE_DIR ?? resolve(process.cwd(), ".data/pg");
if (!process.env.DATABASE_URL) mkdirSync(dirname(dataDir), { recursive: true });
const db = await openDatabase({ url: process.env.DATABASE_URL, dataDir });

const app = createApp({
  db,
  bus: new EventBus(),
  cache: new StudioCache(),
  loginLimiter: new RateLimiter(10, 15 * 60 * 1000),
  config: { appOrigin, secureCookies: appOrigin.startsWith("https://") },
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
