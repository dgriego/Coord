import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inviteAndJoin, makeTestApp, signUp, type Client } from "./test-utils.ts";
import { COST_FIELDS } from "./catalog/items.ts";
import { isPrivateAddress, parseProduct } from "./catalog/clip.ts";
import { vendorsFromCsv } from "./catalog/csv.ts";

let t: Awaited<ReturnType<typeof makeTestApp>>;
beforeAll(async () => {
  t = await makeTestApp();
});
afterAll(async () => {
  await t.db.close();
});

/** A studio with a client, two vendors and a project holding the COM sofa. */
async function studioWithSofa() {
  const owner = await signUp(t.app);
  const o = owner.client;
  const client = (await o.post("/api/clients", { name: "The Hendersons", taxExempt: false })).body;
  const workroom = (await o.post("/api/vendors", { name: "Ashby Upholstery", categories: ["upholstery", "workroom"], website: "https://ashby.example" })).body;
  const fabric = (await o.post("/api/vendors", { name: "Lowell Textiles", categories: ["fabric"] })).body;
  const project = (await o.post("/api/projects", { name: "Henderson Residence", clientId: client.id, taxRateBps: 825, rooms: ["Living Room", "Den"] })).body;
  const detail = (await o.get(`/api/projects/${project.id}`)).body;
  const living = detail.rooms.find((r: { name: string }) => r.name === "Living Room");
  const sofa = (
    await o.post(`/api/projects/${project.id}/items`, {
      name: "Custom sofa",
      roomId: living.id,
      markupBps: 6000,
      components: [
        { vendorId: workroom.id, description: "Frame and labor", netCostCents: 620_000, freightCents: 45_000 },
        { vendorId: fabric.id, description: "Fabric, 14 yd", netCostCents: 17_000, qty: 14, shipTo: "Ashby Upholstery" },
      ],
    })
  ).body;
  return { owner, o, client, workroom, fabric, projectId: project.id as string, living, sofa };
}

function expectNoCost(value: unknown) {
  const json = JSON.stringify(value);
  for (const key of COST_FIELDS) expect(json).not.toContain(`"${key}"`);
  expect(json).not.toContain("netCostCents");
}

describe("projects and items", () => {
  it("prices a COM item from two vendors as one client line", async () => {
    const { o, projectId, sofa } = await studioWithSofa();
    expect(sofa.vendorNames.sort()).toEqual(["Ashby Upholstery", "Lowell Textiles"]);
    expect(sofa.pricing.unitCostCents).toBe(858_000);
    expect(sofa.unitPriceCents).toBe(1_372_800);
    expect(sofa.totalCents).toBe(1_372_800 + 45_000);

    const detail = (await o.get(`/api/projects/${projectId}`)).body;
    expect(detail.totals.priceCents).toBe(1_372_800);
    expect(detail.totals.taxCents).toBe(113_256); // 8.25% of product
    expect(detail.proposedCents).toBe(1_417_800);

    const list = (await o.get("/api/projects")).body;
    expect(list[0]).toMatchObject({ name: "Henderson Residence", clientName: "The Hendersons", itemCount: 1, proposedCents: 1_417_800 });
  });

  it("uses the project's default markup for new items", async () => {
    const { o, projectId } = await studioWithSofa();
    await o.patch(`/api/projects/${projectId}`, { defaultMarkupBps: 2500 });
    const lamp = (await o.post(`/api/projects/${projectId}/items`, { name: "Lamp", components: [{ netCostCents: 40_000 }] })).body;
    expect(lamp.markupBps).toBe(2500);
    expect(lamp.unitPriceCents).toBe(50_000);
  });

  it("changes only the fields a PATCH sends", async () => {
    const { o, sofa } = await studioWithSofa();
    const updated = (await o.patch(`/api/items/${sofa.id}`, { qty: 2 })).body;
    expect(updated.qty).toBe(2);
    expect(updated.name).toBe("Custom sofa");
    expect(updated.roomId).toBe(sofa.roomId);
    expect(updated.markupBps).toBe(6000);
    expect(updated.components).toHaveLength(2);
  });

  it("records price changes in the audit log", async () => {
    const { o, sofa } = await studioWithSofa();
    await o.patch(`/api/items/${sofa.id}`, { markupBps: 5000 });
    const audit = (await o.get("/api/studio/audit")).body;
    expect(audit[0]).toMatchObject({
      action: "item.pricing_changed",
      before: { unitPriceCents: 1_372_800 },
      after: { unitPriceCents: 1_287_000 },
    });
  });

  it("rejects a room from another project", async () => {
    const { o, projectId, living } = await studioWithSofa();
    const other = (await o.post("/api/projects", { name: "Other" })).body;
    const res = await o.post(`/api/projects/${other.id}/items`, { name: "Chair", roomId: living.id });
    expect(res.status).toBe(400);
    expect(projectId).not.toBe(other.id);
  });

  it("creates default rooms when none are given", async () => {
    const owner = await signUp(t.app);
    const p = (await owner.client.post("/api/projects", { name: "Quick one" })).body;
    const detail = (await owner.client.get(`/api/projects/${p.id}`)).body;
    expect(detail.rooms.map((r: { name: string }) => r.name)).toEqual(["Living Room", "Kitchen", "Primary Bedroom"]);
  });
});

describe("cost hiding", () => {
  it("never sends cost, markup or parts to an assistant", async () => {
    const { o, projectId, sofa } = await studioWithSofa();
    const { client: assistant } = await inviteAndJoin(t.app, o, "assistant");

    const detail = (await assistant.get(`/api/projects/${projectId}`)).body;
    expectNoCost(detail);
    expect(detail.items[0].unitPriceCents).toBe(1_372_800);
    expect(detail.items[0].vendorNames).toHaveLength(2);
    expectNoCost((await assistant.get("/api/projects")).body);

    const patched = (await assistant.patch(`/api/items/${sofa.id}`, { name: "Custom sofa, tight back" })).body;
    expectNoCost(patched);
  });

  it("ignores pricing an assistant tries to set", async () => {
    const { o, projectId, sofa, fabric } = await studioWithSofa();
    const { client: assistant } = await inviteAndJoin(t.app, o, "assistant");
    await assistant.patch(`/api/items/${sofa.id}`, { markupBps: 0, components: [] });
    const after = (await o.get(`/api/projects/${projectId}`)).body.items[0];
    expect(after.markupBps).toBe(6000);
    expect(after.components).toHaveLength(2);

    const added = await assistant.post(`/api/projects/${projectId}/items`, { name: "Throw pillow", vendorId: fabric.id, markupBps: 0 });
    expect(added.status).toBe(201);
    expect(added.body.vendorNames).toEqual(["Lowell Textiles"]);
    const asOwner = (await o.get(`/api/projects/${projectId}`)).body.items.find((i: { name: string }) => i.name === "Throw pillow");
    expect(asOwner.markupBps).toBe(3500);
  });

  it("keeps the project list cache separate for each permission set", async () => {
    const { o } = await studioWithSofa();
    const { client: assistant } = await inviteAndJoin(t.app, o, "assistant");
    await o.get("/api/projects"); // warms the owner's cache entry
    expectNoCost((await assistant.get("/api/projects")).body);
  });

  it("doesn't let a bookkeeper edit projects", async () => {
    const { o, sofa } = await studioWithSofa();
    const { client: bookkeeper } = await inviteAndJoin(t.app, o, "bookkeeper");
    expect((await bookkeeper.patch(`/api/items/${sofa.id}`, { qty: 9 })).status).toBe(403);
  });
});

describe("studio isolation", () => {
  it("hides one studio's clients, vendors, projects and items from another", async () => {
    const a = await studioWithSofa();
    const b = await signUp(t.app, "Other Studio");
    const bc: Client = b.client;
    expect((await bc.get("/api/clients")).body).toEqual([]);
    expect((await bc.get("/api/vendors")).body).toEqual([]);
    expect((await bc.get("/api/projects")).body).toEqual([]);
    expect((await bc.get(`/api/projects/${a.projectId}`)).status).toBe(404);
    expect((await bc.patch(`/api/items/${a.sofa.id}`, { qty: 99 })).status).toBe(404);
    expect((await bc.delete(`/api/vendors/${a.workroom.id}`)).status).toBe(404);

    // Can't attach another studio's vendor to an item.
    const mine = (await bc.post("/api/projects", { name: "Mine" })).body;
    const res = await bc.post(`/api/projects/${mine.id}/items`, { name: "Chair", components: [{ vendorId: a.workroom.id, netCostCents: 1 }] });
    expect(res.status).toBe(400);
  });
});

describe("vendors", () => {
  it("filters by category and search", async () => {
    const { o } = await studioWithSofa();
    await o.post("/api/vendors", { name: "Brightwell Lighting", categories: ["lighting"], city: "Dallas" });
    const lighting = (await o.get("/api/vendors?category=lighting")).body;
    expect(lighting.map((v: { name: string }) => v.name)).toEqual(["Brightwell Lighting"]);
    const search = (await o.get("/api/vendors?q=dall")).body;
    expect(search).toHaveLength(1);
    const ashby = (await o.get("/api/vendors?q=ashby")).body[0];
    expect(ashby.itemCount).toBe(1);
  });

  it("imports a spreadsheet with a preview first", async () => {
    const owner = await signUp(t.app);
    const csv = [
      "Vendor,Category,Website,Account #,Trade discount,Lead time (weeks)",
      'Harlow & Finch,"Upholstery; Casegoods",harlow.example,HF-2231,40%,12',
      "Brass Lane,Lighting,,,,",
      ",Lighting,,,,",
      "brass lane,Lighting,,,,",
    ].join("\n");
    const preview = (await owner.client.post("/api/vendors/import", { csv, dryRun: true })).body;
    expect(preview.preview).toHaveLength(2);
    expect(preview.preview[0]).toMatchObject({ name: "Harlow & Finch", categories: ["upholstery", "casegoods"], discountBps: 4000, leadTimeWeeks: 12, accountNumber: "HF-2231" });
    expect(preview.skipped.map((s: { reason: string }) => s.reason)).toEqual(["Missing a name.", "Already in your vendor list."]);
    expect((await owner.client.get("/api/vendors")).body).toHaveLength(0);

    const done = (await owner.client.post("/api/vendors/import", { csv, dryRun: false })).body;
    expect(done.created).toBe(2);
    expect((await owner.client.get("/api/vendors")).body).toHaveLength(2);
  });
});

describe("CSV parsing", () => {
  it("handles quotes, embedded commas and newlines", () => {
    const rows = vendorsFromCsv('Name,Notes\n"Smith, Jones & Co","Line one\nline ""two"""\n');
    expect(rows[0]!.input).toMatchObject({ name: "Smith, Jones & Co", notes: 'Line one\nline "two"' });
  });

  it("reports a missing name column", () => {
    expect(vendorsFromCsv("Company Title,City\nX,Y")[0]!.problem).toMatch(/No column/);
  });
});

describe("URL import", () => {
  it("reads schema.org product data", () => {
    const html = `<html><head><title>Ignore me</title>
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Product","name":"Oslo Sconce &amp; Shade","sku":"OS-12","image":["/img/oslo.jpg"],"brand":{"@type":"Brand","name":"Brightwell"},"offers":{"@type":"Offer","price":"489.00"}}]}</script>
      </head></html>`;
    expect(parseProduct(html, "https://brightwell.example/p/oslo")).toMatchObject({
      name: "Oslo Sconce & Shade",
      sku: "OS-12",
      brand: "Brightwell",
      imageUrl: "https://brightwell.example/img/oslo.jpg",
      msrpCents: 48_900,
    });
  });

  it("falls back to Open Graph and price meta tags", () => {
    const html = `<meta property="og:title" content="Linen Slipper Chair"><meta content="https://cdn.example/c.jpg" property="og:image">
      <meta property="product:price:amount" content="1,250.00">`;
    expect(parseProduct(html, "https://x.example/c")).toMatchObject({ name: "Linen Slipper Chair", imageUrl: "https://cdn.example/c.jpg", msrpCents: 125_000 });
  });

  it("refuses private network addresses", async () => {
    for (const ip of ["127.0.0.1", "10.2.3.4", "192.168.1.1", "172.20.0.1", "169.254.169.254", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      expect(isPrivateAddress(ip)).toBe(true);
    }
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    const owner = await signUp(t.app);
    const res = await owner.client.post("/api/clip", { url: "http://127.0.0.1:8787/api/health" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/private network/);
  });
});
