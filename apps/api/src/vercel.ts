// Vercel Function entry. Bundled by scripts/build-vercel.mjs into
// .vercel/output/functions/api.func. One instance serves many requests
// (Fluid compute), so the database pool is opened once per instance.

import { getRequestListener } from "@hono/node-server";
import { createApp } from "./app.ts";
import { openDatabase } from "./db/client.ts";
import { PostgresBus } from "./events.ts";
import { StudioCache } from "./cache.ts";
import { RateLimiter } from "./rate-limit.ts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL in the Vercel project settings.");

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const appOrigin = process.env.APP_ORIGIN ?? (productionHost ? `https://${productionHost}` : "http://localhost:3000");

// Migrations ran during the build (npm run migrate), so cold starts skip them.
const db = await openDatabase({ url, migrate: false, maxConnections: 5 });

const app = createApp({
  db,
  bus: new PostgresBus(db.pubsub!),
  // Instances don't share memory, so a cached value could miss another
  // instance's write. The browser cache carries the speed instead.
  cache: new StudioCache(0),
  loginLimiter: new RateLimiter(10, 15 * 60 * 1000),
  config: { appOrigin, secureCookies: true },
});

export default getRequestListener(app.fetch);
