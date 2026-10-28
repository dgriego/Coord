import type { Me } from "@coord/shared";
import { createApp } from "./app.ts";
import { openDatabase, type Database } from "./db/client.ts";
import { EventBus } from "./events.ts";
import { StudioCache } from "./cache.ts";
import { RateLimiter } from "./rate-limit.ts";

export const ORIGIN = "http://app.test";

export async function makeTestApp() {
  const db = await openDatabase({});
  const bus = new EventBus();
  const cache = new StudioCache();
  const app = createApp({
    db,
    bus,
    cache,
    loginLimiter: new RateLimiter(5, 60_000),
    // Cheap scrypt so tests stay fast; production uses DEFAULT_SCRYPT.
    config: { appOrigin: ORIGIN, secureCookies: false, scrypt: { N: 1024, r: 8, p: 1 } },
  });
  return { app, db, bus, cache };
}

type App = Awaited<ReturnType<typeof makeTestApp>>["app"];

/** A browser stand-in that keeps the session cookie between requests. */
export class Client {
  cookie = "";
  constructor(private app: App) {}

  async request(method: string, path: string, json?: unknown, headers: Record<string, string> = {}) {
    const res = await this.app.request(path, {
      method,
      headers: {
        origin: ORIGIN,
        ...(json === undefined ? {} : { "content-type": "application/json" }),
        ...(this.cookie ? { cookie: this.cookie } : {}),
        ...headers,
      },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const pair = setCookie.split(";")[0]!;
      this.cookie = pair.endsWith("=") ? "" : pair;
    }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  get = (path: string) => this.request("GET", path);
  post = (path: string, json: unknown = {}) => this.request("POST", path, json);
  patch = (path: string, json: unknown) => this.request("PATCH", path, json);
  delete = (path: string) => this.request("DELETE", path);
}

let n = 0;
export function uniqueEmail(prefix = "user") {
  return `${prefix}${++n}-${Date.now()}@example.com`;
}

export async function signUp(app: App, studioName = "Hollis Interiors") {
  const client = new Client(app);
  const email = uniqueEmail("owner");
  const res = await client.post("/api/auth/signup", {
    name: "Maya Hollis",
    email,
    password: "correct horse battery",
    studioName,
  });
  if (res.status !== 201) throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
  return { client, email, me: res.body as Me };
}

export async function inviteAndJoin(app: App, owner: Client, role: string, name = "Priya Shah") {
  const email = uniqueEmail(role);
  const inv = await owner.post("/api/studio/invitations", { email, role });
  if (inv.status !== 201) throw new Error(`invite failed: ${JSON.stringify(inv.body)}`);
  const token = (inv.body.acceptUrl as string).split("/invite/")[1]!;
  const member = new Client(app);
  const res = await member.post("/api/invitations/accept", { token, name, password: "another long password" });
  if (res.status !== 200) throw new Error(`accept failed: ${JSON.stringify(res.body)}`);
  return { client: member, email, me: res.body as Me };
}

export type { Database };
