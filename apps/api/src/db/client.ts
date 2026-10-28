import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { schema } from "./schema.ts";
import { migrations } from "./migrations.ts";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export interface Database {
  /** Owner connection. Bypasses row-level security: auth and migrations only. */
  sys: Db;
  /** Runs `fn` in a transaction as app_user, scoped to one studio by RLS. */
  withStudio<T>(studioId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Postgres LISTEN/NOTIFY, available on real Postgres (not PGlite). */
  pubsub?: PubSub;
  close(): Promise<void>;
}

export interface PubSub {
  listen(channel: string, onMessage: (payload: string) => void): Promise<() => Promise<void>>;
  notify(channel: string, payload: string): Promise<void>;
}

/**
 * Opens Postgres when `url` is set, otherwise embedded Postgres (PGlite) at
 * `dataDir`, or in memory when `dataDir` is undefined. `migrate: false` skips
 * migrations, for serverless instances where the build already ran them.
 */
export async function openDatabase(opts: {
  url?: string;
  dataDir?: string;
  migrate?: boolean;
  maxConnections?: number;
}): Promise<Database> {
  let sys: Db;
  let close: () => Promise<void>;
  let pubsub: PubSub | undefined;
  // Runs a multi-statement script; drizzle's execute only takes one statement.
  let script: (text: string) => Promise<unknown>;

  if (opts.url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const client = postgres(opts.url, { max: opts.maxConnections ?? 10 });
    sys = drizzle(client, { schema }) as unknown as Db;
    close = () => client.end();
    script = (text) => client.unsafe(text);
    pubsub = {
      async listen(channel, onMessage) {
        const sub = await client.listen(channel, onMessage);
        return () => sub.unlisten();
      },
      async notify(channel, payload) {
        await client.notify(channel, payload);
      },
    };
  } else {
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle } = await import("drizzle-orm/pglite");
    const client = opts.dataDir ? new PGlite(opts.dataDir) : new PGlite();
    sys = drizzle(client, { schema }) as unknown as Db;
    close = () => client.close();
    script = (text) => client.exec(text);
  }

  if (opts.migrate !== false) await migrate(sys, script);

  return {
    sys,
    close,
    pubsub,
    withStudio(studioId, fn) {
      return sys.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.studio_id', ${studioId}, true)`);
        await tx.execute(sql`SET LOCAL ROLE app_user`);
        return fn(tx);
      });
    },
  };
}

async function migrate(db: Db, script: (text: string) => Promise<unknown>) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
  const applied = await db.execute<{ id: string }>(sql`SELECT id FROM schema_migrations`);
  const done = new Set(rows<{ id: string }>(applied).map((r) => r.id));

  for (const m of migrations) {
    if (done.has(m.id)) continue;
    if (!/^[\w-]+$/.test(m.id)) throw new Error(`Bad migration id ${m.id}`);
    try {
      await script(`BEGIN;\n${m.sql}\nINSERT INTO schema_migrations (id) VALUES ('${m.id}');\nCOMMIT;`);
    } catch (err) {
      await script("ROLLBACK;").catch(() => {});
      throw err;
    }
  }
}

/** postgres-js returns an array; PGlite returns `{ rows }`. */
export function rows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}
