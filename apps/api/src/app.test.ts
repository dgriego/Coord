import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { InvalidateEvent } from "@coord/shared";
import { Client, inviteAndJoin, makeTestApp, ORIGIN, signUp, uniqueEmail } from "./test-utils.ts";

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.db.close();
});

describe("sign up and sign in", () => {
  it("creates a studio with the new user as owner", async () => {
    const { client, me } = await signUp(t.app);
    expect(me.role).toBe("owner");
    expect(me.studio.name).toBe("Hollis Interiors");
    expect(me.permissions).toContain("cost.view");

    const again = await client.get("/api/me");
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(me.user.id);
  });

  it("rejects a second account with the same email, in any letter case", async () => {
    const { email } = await signUp(t.app);
    const res = await new Client(t.app).post("/api/auth/signup", {
      name: "Copy",
      email: email.toUpperCase(),
      password: "correct horse battery",
      studioName: "Other",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.fields.email).toBeDefined();
  });

  it("returns field messages for bad input", async () => {
    const res = await new Client(t.app).post("/api/auth/signup", { name: "", email: "nope", password: "short", studioName: "" });
    expect(res.status).toBe(400);
    expect(Object.keys(res.body.error.fields).sort()).toEqual(["email", "name", "password", "studioName"]);
  });

  it("signs in with the right password only, and signs out", async () => {
    const { email } = await signUp(t.app);
    const c = new Client(t.app);
    expect((await c.post("/api/auth/login", { email, password: "wrong password!" })).status).toBe(401);
    expect((await c.post("/api/auth/login", { email, password: "correct horse battery" })).status).toBe(200);
    expect((await c.get("/api/me")).status).toBe(200);
    expect((await c.post("/api/auth/logout")).status).toBe(204);
    expect((await c.get("/api/me")).status).toBe(401);
  });

  it("locks out repeated failed sign-ins", async () => {
    const { email } = await signUp(t.app);
    const c = new Client(t.app);
    for (let i = 0; i < 5; i++) await c.post("/api/auth/login", { email, password: "wrong password!" });
    const res = await c.post("/api/auth/login", { email, password: "correct horse battery" });
    expect(res.status).toBe(429);
  });
});

describe("invitations", () => {
  it("lets a new person join through the link and appear on the team", async () => {
    const owner = await signUp(t.app);
    const email = uniqueEmail("designer");
    const inv = await owner.client.post("/api/studio/invitations", { email, role: "designer" });
    expect(inv.status).toBe(201);
    const token = inv.body.acceptUrl.split("/invite/")[1];
    expect(inv.body.acceptUrl.startsWith(`${ORIGIN}/invite/`)).toBe(true);

    const visitor = new Client(t.app);
    const preview = await visitor.get(`/api/invitations/${token}`);
    expect(preview.body).toMatchObject({ studioName: "Hollis Interiors", email, role: "designer", hasAccount: false });

    const joined = await visitor.post("/api/invitations/accept", { token, name: "Jordan Lee", password: "a long password" });
    expect(joined.status).toBe(200);
    expect(joined.body.role).toBe("designer");

    const members = await owner.client.get("/api/studio/members");
    expect(members.body.map((m: { name: string }) => m.name).sort()).toEqual(["Jordan Lee", "Maya Hollis"]);

    // The link works once.
    expect((await new Client(t.app).get(`/api/invitations/${token}`)).status).toBe(404);
  });

  it("requires signing in to accept with an email that already has an account", async () => {
    const studioA = await signUp(t.app, "Studio A");
    const studioB = await signUp(t.app, "Studio B");
    const inv = await studioB.client.post("/api/studio/invitations", { email: studioA.email, role: "admin" });
    const token = inv.body.acceptUrl.split("/invite/")[1];

    const stranger = new Client(t.app);
    const denied = await stranger.post("/api/invitations/accept", { token });
    expect(denied.status).toBe(401);

    const accepted = await studioA.client.post("/api/invitations/accept", { token });
    expect(accepted.status).toBe(200);
    expect(accepted.body.studio.name).toBe("Studio B");
    expect(accepted.body.studios.map((s: { name: string }) => s.name)).toEqual(["Studio A", "Studio B"]);
  });

  it("signs in as the new account when someone else was signed in on this browser", async () => {
    const owner = await signUp(t.app);
    const email = uniqueEmail("newcomer");
    const inv = await owner.client.post("/api/studio/invitations", { email, role: "designer" });
    const token = inv.body.acceptUrl.split("/invite/")[1];

    // Same browser, still signed in as the owner.
    const joined = await owner.client.post("/api/invitations/accept", { token, name: "Sam Ortiz", password: "a long password" });
    expect(joined.body.user.email).toBe(email);
    const me = await owner.client.get("/api/me");
    expect(me.body.user.email).toBe(email);
    expect(me.body.role).toBe("designer");
  });

  it("can be cancelled", async () => {
    const owner = await signUp(t.app);
    const inv = await owner.client.post("/api/studio/invitations", { email: uniqueEmail(), role: "assistant" });
    expect((await owner.client.get("/api/studio/invitations")).body).toHaveLength(1);
    expect((await owner.client.delete(`/api/studio/invitations/${inv.body.id}`)).status).toBe(204);
    expect((await owner.client.get("/api/studio/invitations")).body).toHaveLength(0);
    const token = inv.body.acceptUrl.split("/invite/")[1];
    expect((await new Client(t.app).get(`/api/invitations/${token}`)).status).toBe(404);
  });
});

describe("roles", () => {
  it("stops assistants from managing the team", async () => {
    const owner = await signUp(t.app);
    const assistant = await inviteAndJoin(t.app, owner.client, "assistant");
    expect(assistant.me.permissions).not.toContain("cost.view");
    const res = await assistant.client.post("/api/studio/invitations", { email: uniqueEmail(), role: "designer" });
    expect(res.status).toBe(403);
    expect((await assistant.client.get("/api/studio/audit")).status).toBe(403);
  });

  it("stops admins from creating or changing owners", async () => {
    const owner = await signUp(t.app);
    const admin = await inviteAndJoin(t.app, owner.client, "admin", "Diane Park");
    expect((await admin.client.post("/api/studio/invitations", { email: uniqueEmail(), role: "owner" })).status).toBe(403);
    expect((await admin.client.patch(`/api/studio/members/${owner.me.user.id}`, { role: "designer" })).status).toBe(403);
    expect((await admin.client.patch(`/api/studio/members/${admin.me.user.id}`, { role: "owner" })).status).toBe(403);
  });

  it("never leaves a studio without an owner", async () => {
    const owner = await signUp(t.app);
    const res = await owner.client.patch(`/api/studio/members/${owner.me.user.id}`, { role: "designer" });
    expect(res.status).toBe(409);
    expect((await owner.client.delete(`/api/studio/members/${owner.me.user.id}`)).status).toBe(409);
  });

  it("applies a role change to the member's next request", async () => {
    const owner = await signUp(t.app);
    const member = await inviteAndJoin(t.app, owner.client, "designer");
    await owner.client.patch(`/api/studio/members/${member.me.user.id}`, { role: "assistant" });
    const me = await member.client.get("/api/me");
    expect(me.body.role).toBe("assistant");
    expect(me.body.cacheKey).not.toBe(member.me.cacheKey);
  });

  it("signs a removed member out of that studio", async () => {
    const owner = await signUp(t.app);
    const member = await inviteAndJoin(t.app, owner.client, "designer");
    expect((await owner.client.delete(`/api/studio/members/${member.me.user.id}`)).status).toBe(204);
    expect((await member.client.get("/api/me")).status).toBe(401);
  });
});

describe("studio isolation", () => {
  it("never shows or changes another studio's people", async () => {
    const a = await signUp(t.app, "Studio A");
    const aMember = await inviteAndJoin(t.app, a.client, "designer");
    const b = await signUp(t.app, "Studio B");

    const members = await b.client.get("/api/studio/members");
    expect(members.body).toHaveLength(1);
    expect(members.body[0].userId).toBe(b.me.user.id);

    expect((await b.client.patch(`/api/studio/members/${aMember.me.user.id}`, { role: "assistant" })).status).toBe(404);
    expect((await b.client.delete(`/api/studio/members/${aMember.me.user.id}`)).status).toBe(404);
    expect((await b.client.post("/api/me/studio", { studioId: a.me.studio.id })).status).toBe(403);

    const audit = await b.client.get("/api/studio/audit");
    expect(audit.body.every((e: { entityId: string }) => e.entityId !== aMember.me.user.id)).toBe(true);
  });
});

describe("request safety", () => {
  it("rejects writes from another origin and non-JSON writes", async () => {
    const owner = await signUp(t.app);
    const foreign = await owner.client.request("POST", "/api/studio/invitations", { email: uniqueEmail(), role: "designer" }, {
      origin: "https://evil.example",
    });
    expect(foreign.status).toBe(403);
    const form = await owner.client.request("POST", "/api/studio/invitations", undefined, {
      "content-type": "text/plain",
      "content-length": "10",
    });
    expect(form.status).toBe(415);
  });

  it("sets an httpOnly, SameSite session cookie", async () => {
    const res = await t.app.request("/api/auth/signup", {
      method: "POST",
      headers: { origin: ORIGIN, "content-type": "application/json" },
      body: JSON.stringify({ name: "A", email: uniqueEmail(), password: "correct horse battery", studioName: "S" }),
    });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

describe("audit log and live updates", () => {
  it("records team changes with before and after values", async () => {
    const owner = await signUp(t.app);
    const member = await inviteAndJoin(t.app, owner.client, "designer");
    await owner.client.patch(`/api/studio/members/${member.me.user.id}`, { role: "bookkeeper" });
    const audit = await owner.client.get("/api/studio/audit");
    const actions = audit.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(["member.role_changed", "invitation.accepted", "invitation.created", "studio.created"]);
    expect(audit.body[0]).toMatchObject({ before: { role: "designer" }, after: { role: "bookkeeper" }, actorName: "Maya Hollis" });
  });

  it("tells open clients in the same studio what to refetch", async () => {
    const owner = await signUp(t.app);
    const other = await signUp(t.app, "Elsewhere");
    const seen: InvalidateEvent[] = [];
    const otherSeen: InvalidateEvent[] = [];
    const stop = t.bus.subscribe(owner.me.studio.id, (e) => seen.push(e));
    const stopOther = t.bus.subscribe(other.me.studio.id, (e) => otherSeen.push(e));

    await owner.client.post("/api/studio/invitations", { email: uniqueEmail(), role: "designer" });
    stop();
    stopOther();
    expect(seen).toEqual([{ type: "invalidate", keys: [["invitations"], ["audit"]] }]);
    expect(otherSeen).toEqual([]);
  });

  it("streams events over SSE", async () => {
    const owner = await signUp(t.app);
    const res = await t.app.request("/api/events", { headers: { cookie: owner.client.cookie } });
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    const reader = res.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("event: ready");
    await reader.cancel();
  });
});
