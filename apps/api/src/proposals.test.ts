import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProposalDetail, SharedProposal } from "@coord/shared";
import { Client, inviteAndJoin, makeTestApp, signUp } from "./test-utils.ts";
import { COST_FIELDS } from "./catalog/items.ts";
import { maskEmail, parseShareToken, shareToken } from "./proposals/model.ts";
import { signStripePayload, verifyStripeSignature } from "./payments/provider.ts";

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.db.close();
});

// Sofa: $13,728 price + $450 freight + 8.25% tax on product = $15,310.56.
const SOFA_TOTAL = 1_372_800 + 45_000 + 113_256;

/** A studio with a client (with email), the COM sofa and a lamp, ready to propose. */
async function studio() {
  const owner = await signUp(t.app);
  const o = owner.client;
  const client = (await o.post("/api/clients", { name: "The Hendersons", email: "hendersons@example.com" })).body;
  const workroom = (await o.post("/api/vendors", { name: "Ashby Upholstery" })).body;
  const fabric = (await o.post("/api/vendors", { name: "Lowell Textiles" })).body;
  const project = (await o.post("/api/projects", { name: "Henderson Residence", clientId: client.id, taxRateBps: 825, rooms: ["Living Room"] })).body;
  const projectId = project.id as string;
  const sofa = (
    await o.post(`/api/projects/${projectId}/items`, {
      name: "Custom sofa",
      markupBps: 6000,
      components: [
        { vendorId: workroom.id, description: "Frame and labor", netCostCents: 620_000, freightCents: 45_000 },
        { vendorId: fabric.id, description: "Fabric, 14 yd", netCostCents: 17_000, qty: 14 },
      ],
    })
  ).body;
  const lamp = (await o.post(`/api/projects/${projectId}/items`, { name: "Floor lamp", markupBps: 5000, components: [{ vendorId: workroom.id, netCostCents: 40_000 }] })).body;
  return { owner, o, client, projectId, sofa, lamp };
}

async function sentProposal() {
  const s = await studio();
  const created = await s.o.post("/api/proposals", { projectId: s.projectId, title: "Living room furnishings", itemIds: [s.sofa.id, s.lamp.id] });
  expect(created.status).toBe(201);
  const sent = await s.o.post(`/api/proposals/${created.body.id}/send`);
  expect(sent.status).toBe(200);
  const detail = sent.body as ProposalDetail;
  const token = detail.share!.url.split("/p/")[1]!;
  return { ...s, proposal: detail, token };
}

/** The client's browser: verifies with the emailed code. */
async function verifiedVisitor(token: string) {
  const visitor = new Client(t.app);
  const sent = await visitor.post(`/api/share/${token}/code`);
  expect(sent.status).toBe(200);
  const code = /is (\d{6})/.exec(t.mailer.sent.at(-1)!.text)![1]!;
  expect((await visitor.post(`/api/share/${token}/verify`, { code })).status).toBe(200);
  return visitor;
}

async function webhook(event: object, secret = t.payments.webhookSecret) {
  const raw = JSON.stringify(event);
  const res = await t.app.request("/api/stripe/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "stripe-signature": signStripePayload(raw, secret) },
    body: raw,
  });
  return { status: res.status, body: await res.json() };
}

/** What Stripe sends when checkout finishes, for the payment behind `url`. */
function checkoutEvent(url: string, type: string, paymentStatus: "paid" | "unpaid", amount?: number) {
  const sessionId = url.split("/").at(-1)!;
  const s = t.payments.sessions.get(sessionId)!;
  return {
    id: `evt_${Math.random()}`,
    type,
    account: s.accountId,
    data: { object: { id: sessionId, amount_total: amount ?? s.amountCents, payment_status: paymentStatus, metadata: { payment_id: s.paymentId } } },
  };
}

function expectNoCost(text: string) {
  // "totals" is the cost summary on projects; client proposal totals are allowed.
  for (const key of [...COST_FIELDS.filter((k) => k !== "totals"), "unitCostCents", "profitCents", "costTotals", "netCostCents", "itemId"]) {
    expect(text).not.toContain(`"${key}"`);
  }
  // Vendors are the studio's sourcing; clients never see them.
  expect(text).not.toContain("Ashby");
  expect(text).not.toContain("Lowell");
}

describe("proposals", () => {
  it("snapshots item pricing into a draft and totals the deposit", async () => {
    const { o, projectId, sofa, lamp } = await studio();
    const res = await o.post("/api/proposals", { projectId, title: "Living room", itemIds: [sofa.id, lamp.id] });
    const p = res.body as ProposalDetail;
    expect(p.number).toBe(1);
    expect(p.status).toBe("draft");
    expect(p.depositBps).toBe(5000);
    const line = p.lines.find((l) => l.name === "Custom sofa")!;
    expect(line.totalCents).toBe(SOFA_TOTAL);
    expect(line.unitCostCents).toBe(858_000);
    // Lamp: $600 + 8.25% = $649.50, so deposits round per line.
    expect(p.totals.depositCents).toBe(Math.round(SOFA_TOTAL / 2) + Math.round(64_950 / 2));
    expect(p.costTotals!.costCents).toBe(858_000 + 40_000);
  });

  it("lets drafts change, then freezes the sent version", async () => {
    const { o, projectId, sofa, lamp } = await studio();
    const p = (await o.post("/api/proposals", { projectId, title: "Living room", itemIds: [sofa.id] })).body as ProposalDetail;
    const withLamp = (await o.post(`/api/proposals/${p.id}/lines`, { itemIds: [lamp.id, sofa.id] })).body as ProposalDetail;
    expect(withLamp.lines.map((l) => l.name)).toEqual(["Custom sofa", "Floor lamp"]);
    const lampLine = withLamp.lines[1]!;
    const custom = (await o.patch(`/api/proposals/${p.id}/lines/${lampLine.id}`, { depositBps: 10_000 })).body as ProposalDetail;
    expect(custom.lines[1]!.depositCents).toBe(64_950);

    await o.patch(`/api/items/${sofa.id}`, { markupBps: 7000 });
    const refreshed = (await o.post(`/api/proposals/${p.id}/refresh`)).body as ProposalDetail;
    expect(refreshed.lines[0]!.unitPriceCents).toBe(1_458_600);

    await o.post(`/api/proposals/${p.id}/send`);
    await o.patch(`/api/items/${sofa.id}`, { markupBps: 9000 });
    const after = (await o.get(`/api/proposals/${p.id}`)).body as ProposalDetail;
    expect(after.lines[0]!.unitPriceCents).toBe(1_458_600);
    expect((await o.patch(`/api/proposals/${p.id}`, { title: "Changed" })).status).toBe(409);
    expect((await o.post(`/api/proposals/${p.id}/refresh`)).status).toBe(409);
    expect((await o.delete(`/api/proposals/${p.id}`)).status).toBe(409);
  });

  it("needs a client email to send, emails the link, and marks items proposed", async () => {
    const { o, projectId, sofa, client } = await studio();
    await o.patch(`/api/clients/${client.id}`, { email: "" });
    const p = (await o.post("/api/proposals", { projectId, title: "Living room", itemIds: [sofa.id] })).body as ProposalDetail;
    const refused = await o.post(`/api/proposals/${p.id}/send`);
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe("no_client_email");

    await o.patch(`/api/clients/${client.id}`, { email: "hendersons@example.com" });
    const sent = (await o.post(`/api/proposals/${p.id}/send`)).body as ProposalDetail;
    expect(sent.status).toBe("sent");
    expect(sent.clientEmail).toBe("hendersons@example.com");
    const mail = t.mailer.sent.at(-1)!;
    expect(mail.to).toBe("hendersons@example.com");
    expect(mail.text).toContain(sent.share!.url);
    const project = (await o.get(`/api/projects/${projectId}`)).body;
    expect(project.items.find((i: { id: string }) => i.id === sofa.id).status).toBe("proposed");
  });

  it("hides cost from roles without cost.view", async () => {
    const { o, proposal } = await sentProposal();
    const assistant = await inviteAndJoin(t.app, o, "assistant");
    const res = await assistant.client.get(`/api/proposals/${proposal.id}`);
    expect(res.status).toBe(200);
    expect(res.body.lines).toHaveLength(2);
    const json = JSON.stringify(res.body);
    for (const key of ["unitCostCents", "profitCents", "costTotals"]) expect(json).not.toContain(`"${key}"`);
    // Assistants can't send or record payments.
    expect((await assistant.client.post(`/api/proposals/${proposal.id}/versions`)).status).toBe(403);
    expect((await assistant.client.post(`/api/proposals/${proposal.id}/payments`, { amountCents: 100, method: "check" })).status).toBe(403);
  });

  it("keeps each studio's proposals private", async () => {
    const { proposal } = await sentProposal();
    const other = await signUp(t.app, "Atelier Nine");
    expect((await other.client.get(`/api/proposals/${proposal.id}`)).status).toBe(404);
    expect((await other.client.get(`/api/proposals?projectId=${proposal.projectId}`)).body).toEqual([]);
  });
});

describe("client share link", () => {
  it("never sends cost, margin or vendors to the client (JSON and page)", async () => {
    const { token } = await sentProposal();
    const visitor = new Client(t.app);
    const json = await visitor.get(`/api/share/${token}`);
    expect(json.status).toBe(200);
    const view = json.body as SharedProposal;
    expect(view.lines).toHaveLength(2);
    expect(view.verified).toBe(false);
    expect(view.maskedEmail).toBe(maskEmail("hendersons@example.com"));
    expectNoCost(JSON.stringify(view));

    const page = await t.app.request(`/p/${token}`);
    expect(page.status).toBe(200);
    expect(page.headers.get("cache-control")).toContain("no-store");
    const html = await page.text();
    expect(html).toContain("Custom sofa");
    expect(html).not.toContain("858,000");
    expect(html).not.toContain("$8,580");
    expectNoCost(html);
  });

  it("allow-lists every field of the client view", async () => {
    const { token } = await sentProposal();
    const view = (await new Client(t.app).get(`/api/share/${token}`)).body as SharedProposal;
    expect(Object.keys(view.lines[0]!).sort()).toEqual(
      ["chargesCents", "clientNote", "decision", "depositBps", "depositCents", "description", "dimensions", "finish", "id", "imageUrl", "name", "qty", "roomName", "taxCents", "totalCents", "unit", "unitPriceCents"].sort(),
    );
  });

  it("rejects forged, revoked and unknown tokens", async () => {
    const { o, proposal, token } = await sentProposal();
    expect(parseShareToken("test-link-secret", token)).toBeTruthy();
    const forged = shareToken("some-other-secret", token.split(".")[0]!);
    expect((await new Client(t.app).get(`/api/share/${forged}`)).status).toBe(404);
    expect((await t.app.request(`/p/not-a-token`)).status).toBe(404);

    const replaced = (await o.post(`/api/proposals/${proposal.id}/share`)).body as ProposalDetail;
    expect((await new Client(t.app).get(`/api/share/${token}`)).status).toBe(404);
    const fresh = replaced.share!.url.split("/p/")[1]!;
    expect((await new Client(t.app).get(`/api/share/${fresh}`)).status).toBe(200);
    await o.delete(`/api/proposals/${proposal.id}/share`);
    expect((await new Client(t.app).get(`/api/share/${fresh}`)).status).toBe(404);
  });

  it("requires the emailed code before approving, and limits guesses", async () => {
    const { token, proposal } = await sentProposal();
    const visitor = new Client(t.app);
    const line = proposal.lines[0]!;
    expect((await visitor.post(`/api/share/${token}/lines/${line.id}`, { decision: "approved" })).status).toBe(403);

    await visitor.post(`/api/share/${token}/code`);
    const mail = t.mailer.sent.at(-1)!;
    expect(mail.to).toBe("hendersons@example.com");
    const code = /is (\d{6})/.exec(mail.text)![1]!;
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) expect((await visitor.post(`/api/share/${token}/verify`, { code: wrong })).status).toBe(400);
    // Five wrong guesses burn the code, even when the right one comes next.
    const burned = await visitor.post(`/api/share/${token}/verify`, { code });
    expect(burned.body.error.code).toBe("code_expired");
  });

  it("runs approve, sign and card deposit end to end", async () => {
    const { o, projectId, sofa, lamp, proposal, token } = await sentProposal();
    const visitor = await verifiedVisitor(token);
    const sofaLine = proposal.lines.find((l) => l.name === "Custom sofa")!;
    const lampLine = proposal.lines.find((l) => l.name === "Floor lamp")!;

    let view = (await visitor.post(`/api/share/${token}/lines/${sofaLine.id}`, { decision: "approved" })).body as SharedProposal;
    expect(view.verified).toBe(true);
    expect(view.canSign).toBe(false);
    view = (await visitor.post(`/api/share/${token}/lines/${lampLine.id}`, { decision: "rejected", note: "Too tall" })).body as SharedProposal;
    expect(view.canSign).toBe(true);
    expect((await visitor.post(`/api/share/${token}/checkout`)).status).toBe(409);

    // Payments need the studio's connected account.
    const signed = (await visitor.post(`/api/share/${token}/sign`, { name: "Ann Henderson", agree: true })).body as SharedProposal;
    expect(signed.status).toBe("partially_approved");
    expect(signed.signature!.name).toBe("Ann Henderson");
    expect(signed.totals.depositCents).toBe(Math.round(SOFA_TOTAL / 2));
    expect(signed.canPay).toBe(false);
    expect((await visitor.post(`/api/share/${token}/lines/${sofaLine.id}`, { decision: "rejected" })).status).toBe(409);

    let items = (await o.get(`/api/projects/${projectId}`)).body.items as { id: string; status: string }[];
    expect(items.find((i) => i.id === sofa.id)!.status).toBe("approved");
    expect(items.find((i) => i.id === lamp.id)!.status).toBe("rejected");

    const connect = await o.post("/api/studio/payments/connect");
    expect(connect.status).toBe(200);
    expect((await o.get("/api/studio/payments")).body.status).toBe("enabled");
    expect(((await visitor.get(`/api/share/${token}`)).body as SharedProposal).canPay).toBe(true);

    const checkout = await visitor.post(`/api/share/${token}/checkout`);
    expect(checkout.status).toBe(200);
    const event = checkoutEvent(checkout.body.url, "checkout.session.completed", "paid");
    expect((await webhook(event)).body.result).toBe("applied");
    // Stripe retries deliveries; a replay changes nothing.
    expect((await webhook(event)).body.result).toBe("ignored");

    const detail = (await o.get(`/api/proposals/${proposal.id}`)).body as ProposalDetail;
    expect(detail.totals.paidCents).toBe(Math.round(SOFA_TOTAL / 2));
    expect(detail.totals.balanceDueCents).toBe(0);
    expect(detail.payments[0]).toMatchObject({ status: "succeeded", method: "card" });
    expect(detail.signature).toMatchObject({ name: "Ann Henderson", email: "hendersons@example.com" });
    expect(detail.signature!.documentHash).toMatch(/^[0-9a-f]{64}$/);
    items = (await o.get(`/api/projects/${projectId}`)).body.items;
    expect(items.find((i) => i.id === sofa.id)!.status).toBe("deposit_paid");

    const audit = (await o.get("/api/studio/audit")).body as { action: string }[];
    expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(["proposal.sent", "proposal.signed", "payment.succeeded"]));
  });

  it("shows ACH as processing until it settles", async () => {
    const { o, projectId, sofa, proposal, token } = await sentProposal();
    await o.post("/api/studio/payments/connect");
    const visitor = await verifiedVisitor(token);
    for (const l of proposal.lines) await visitor.post(`/api/share/${token}/lines/${l.id}`, { decision: "approved" });
    expect(((await visitor.post(`/api/share/${token}/sign`, { name: "Ann Henderson", agree: true })).body as SharedProposal).status).toBe("approved");

    const { url } = (await visitor.post(`/api/share/${token}/checkout`)).body;
    await webhook(checkoutEvent(url, "checkout.session.completed", "unpaid"));
    let detail = (await o.get(`/api/proposals/${proposal.id}`)).body as ProposalDetail;
    expect(detail.payments[0]).toMatchObject({ status: "processing", method: "us_bank_account" });
    expect(detail.totals.paidCents).toBe(0);
    expect(detail.totals.balanceDueCents).toBe(0);
    let items = (await o.get(`/api/projects/${projectId}`)).body.items as { id: string; status: string }[];
    expect(items.find((i) => i.id === sofa.id)!.status).toBe("approved");

    await webhook(checkoutEvent(url, "checkout.session.async_payment_succeeded", "paid"));
    detail = (await o.get(`/api/proposals/${proposal.id}`)).body as ProposalDetail;
    expect(detail.payments[0]!.status).toBe("succeeded");
    items = (await o.get(`/api/projects/${projectId}`)).body.items;
    expect(items.every((i) => i.status === "deposit_paid")).toBe(true);
  });

  it("refuses bad signatures and mismatched amounts", async () => {
    const { o, proposal, token } = await sentProposal();
    await o.post("/api/studio/payments/connect");
    const visitor = await verifiedVisitor(token);
    for (const l of proposal.lines) await visitor.post(`/api/share/${token}/lines/${l.id}`, { decision: "approved" });
    await visitor.post(`/api/share/${token}/sign`, { name: "Ann Henderson", agree: true });
    const { url } = (await visitor.post(`/api/share/${token}/checkout`)).body;

    expect((await webhook(checkoutEvent(url, "checkout.session.completed", "paid"), "wrong-secret")).status).toBe(400);
    expect((await webhook(checkoutEvent(url, "checkout.session.completed", "paid", 100))).body.result).toBe("ignored");
    expect(((await o.get(`/api/proposals/${proposal.id}`)).body as ProposalDetail).totals.paidCents).toBe(0);
  });

  it("replaces an unsigned version with a new one", async () => {
    const { o, sofa, proposal, token } = await sentProposal();
    await o.patch(`/api/items/${sofa.id}`, { qty: 2 });
    const v2 = (await o.post(`/api/proposals/${proposal.id}/versions`)).body as ProposalDetail;
    expect(v2.version).toBe(2);
    expect(v2.status).toBe("draft");
    expect(v2.lines.find((l) => l.name === "Custom sofa")!.qty).toBe(2);
    // The client keeps seeing version 1 until version 2 is sent.
    expect(((await new Client(t.app).get(`/api/share/${token}`)).body as SharedProposal).version).toBe(1);

    await o.post(`/api/proposals/${proposal.id}/send`);
    const view = (await new Client(t.app).get(`/api/share/${token}`)).body as SharedProposal;
    expect(view.version).toBe(2);
    const v1 = (await o.get(`/api/proposals/${proposal.id}?version=1`)).body as ProposalDetail;
    expect(v1.status).toBe("superseded");
    expect(v1.latest).toBe(false);
  });

  it("records a check against the deposit, up to the balance", async () => {
    const { o, proposal, token } = await sentProposal();
    const visitor = await verifiedVisitor(token);
    for (const l of proposal.lines) await visitor.post(`/api/share/${token}/lines/${l.id}`, { decision: "approved" });
    expect((await o.post(`/api/proposals/${proposal.id}/payments`, { amountCents: 100, method: "check" })).status).toBe(409);
    await visitor.post(`/api/share/${token}/sign`, { name: "Ann Henderson", agree: true });

    const due = ((await o.get(`/api/proposals/${proposal.id}`)).body as ProposalDetail).totals.balanceDueCents;
    expect((await o.post(`/api/proposals/${proposal.id}/payments`, { amountCents: due + 1, method: "check" })).status).toBe(400);
    const paid = (await o.post(`/api/proposals/${proposal.id}/payments`, { amountCents: due, method: "check", note: "Check 1042" })).body as ProposalDetail;
    expect(paid.totals.balanceDueCents).toBe(0);
    expect(paid.payments[0]).toMatchObject({ method: "check", status: "succeeded", note: "Check 1042" });
  });
});

describe("studio settings", () => {
  it("sets proposal defaults used by new proposals", async () => {
    const { o, projectId, sofa } = await studio();
    const saved = await o.patch("/api/studio/settings", { depositBps: 3000, terms: "Custom orders are non-refundable.", address: "12 Main St" });
    expect(saved.body).toMatchObject({ depositBps: 3000, terms: "Custom orders are non-refundable." });
    const p = (await o.post("/api/proposals", { projectId, title: "Living room", itemIds: [sofa.id] })).body as ProposalDetail;
    expect(p.depositBps).toBe(3000);
    expect(p.terms).toBe("Custom orders are non-refundable.");
  });

  it("is owner-only to change", async () => {
    const { o } = await studio();
    const admin = await inviteAndJoin(t.app, o, "admin");
    expect((await admin.client.patch("/api/studio/settings", { depositBps: 0 })).status).toBe(403);
    // Admins do manage payments.
    expect((await admin.client.get("/api/studio/payments")).status).toBe(200);
  });
});

describe("webhook signatures", () => {
  it("verifies Stripe's scheme and rejects stale or altered payloads", () => {
    const body = '{"id":"evt_1"}';
    const header = signStripePayload(body, "whsec_test");
    expect(() => verifyStripeSignature(body, header, "whsec_test")).not.toThrow();
    expect(() => verifyStripeSignature(body + " ", header, "whsec_test")).toThrow();
    expect(() => verifyStripeSignature(body, header, "whsec_test", Date.now() + 10 * 60 * 1000)).toThrow();
    expect(() => verifyStripeSignature(body, undefined, "whsec_test")).toThrow();
  });
});

