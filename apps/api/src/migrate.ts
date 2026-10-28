// Applies pending migrations to DATABASE_URL and exits. Runs during the
// Vercel build so serverless instances never race to migrate on cold start.
import { openDatabase } from "./db/client.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.log("DATABASE_URL isn't set; skipping migrations.");
  process.exit(0);
}
const db = await openDatabase({ url, maxConnections: 1 });
await db.close();
console.log("Migrations are up to date.");
