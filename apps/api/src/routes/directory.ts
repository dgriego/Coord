import { Hono } from "hono";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  clientInput,
  vendorImportInput,
  vendorInput,
  VENDOR_CATEGORIES,
  type Client,
  type Vendor,
  type VendorCategory,
  type VendorImportResult,
} from "@coord/shared";
import { requirePermission, requireSession, type Env } from "../context.ts";
import { clients, itemComponents, projects, vendors } from "../db/schema.ts";
import { audit } from "../audit.ts";
import { body, HttpError, notFound, patchBody } from "../http.ts";
import { vendorsFromCsv } from "../catalog/csv.ts";
import { changed, inStudio, iso } from "./helpers.ts";

// Clients and vendors: the studio's address book.

const toClient = (r: typeof clients.$inferSelect, projectCount: number): Client => ({
  id: r.id,
  name: r.name,
  email: r.email,
  phone: r.phone,
  address: r.address,
  taxExempt: r.taxExempt,
  notes: r.notes,
  projectCount,
  createdAt: iso(r.createdAt),
});

const toVendor = (r: typeof vendors.$inferSelect, itemCount: number): Vendor => ({
  id: r.id,
  name: r.name,
  categories: r.categories,
  website: r.website,
  email: r.email,
  phone: r.phone,
  accountNumber: r.accountNumber,
  repName: r.repName,
  repEmail: r.repEmail,
  city: r.city,
  state: r.state,
  discountBps: r.discountBps,
  leadTimeWeeks: r.leadTimeWeeks,
  paymentTerms: r.paymentTerms,
  notes: r.notes,
  itemCount,
  createdAt: iso(r.createdAt),
});

const projectCount = sql<number>`(SELECT count(*)::int FROM ${projects} p WHERE p.client_id = "clients"."id")`;
const itemCount = sql<number>`(SELECT count(DISTINCT ic.item_id)::int FROM ${itemComponents} ic WHERE ic.vendor_id = "vendors"."id")`;

export const clientRoutes = new Hono<Env>()
  .use(requireSession)
  .get("/", async (c) => {
    const rows = await inStudio(c, (tx) =>
      tx.select({ r: clients, n: projectCount }).from(clients).orderBy(asc(sql`lower(${clients.name})`)),
    );
    return c.json(rows.map(({ r, n }) => toClient(r, n)));
  })
  .get("/:id", async (c) => {
    const [row] = await inStudio(c, (tx) =>
      tx.select({ r: clients, n: projectCount }).from(clients).where(eq(clients.id, c.req.param("id"))),
    );
    if (!row) throw notFound("That client");
    return c.json(toClient(row.r, row.n));
  })
  .post("/", requirePermission("projects.edit"), async (c) => {
    const input = await body(c, clientInput);
    const { studioId, userId } = c.var.session;
    const row = await inStudio(c, async (tx) => {
      const [r] = await tx.insert(clients).values({ ...input, studioId }).returning();
      await audit(tx, { studioId, actorUserId: userId, action: "client.created", entityType: "client", entityId: r!.id, after: { name: r!.name } });
      return r!;
    });
    changed(c, ["clients"]);
    return c.json(toClient(row, 0), 201);
  })
  .patch("/:id", requirePermission("projects.edit"), async (c) => {
    const input = await patchBody(c, clientInput.partial());
    const row = await inStudio(c, async (tx) => {
      const [r] = await tx
        .update(clients)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(clients.id, c.req.param("id")))
        .returning();
      return r;
    });
    if (!row) throw notFound("That client");
    changed(c, ["clients"], ["projects"]);
    return c.json(toClient(row, 0));
  })
  .delete("/:id", requirePermission("projects.edit"), async (c) => {
    const { studioId, userId } = c.var.session;
    await inStudio(c, async (tx) => {
      const [r] = await tx.delete(clients).where(eq(clients.id, c.req.param("id"))).returning();
      if (!r) throw notFound("That client");
      await audit(tx, { studioId, actorUserId: userId, action: "client.deleted", entityType: "client", entityId: r.id, before: { name: r.name } });
    });
    changed(c, ["clients"], ["projects"]);
    return c.body(null, 204);
  });

export const vendorRoutes = new Hono<Env>()
  .use(requireSession)
  .get("/", async (c) => {
    const q = c.req.query("q")?.trim().toLowerCase();
    const category = c.req.query("category") as VendorCategory | undefined;
    if (category && !VENDOR_CATEGORIES.includes(category)) throw new HttpError(400, "invalid_input", "Unknown vendor category.");
    const rows = await inStudio(c, (tx) =>
      tx
        .select({ r: vendors, n: itemCount })
        .from(vendors)
        .where(
          and(
            q ? sql`(lower(${vendors.name}) LIKE ${"%" + q + "%"} OR lower(${vendors.repName}) LIKE ${"%" + q + "%"} OR lower(${vendors.city}) LIKE ${"%" + q + "%"})` : undefined,
            category ? sql`${category} = ANY(${vendors.categories})` : undefined,
          ),
        )
        .orderBy(asc(sql`lower(${vendors.name})`)),
    );
    return c.json(rows.map(({ r, n }) => toVendor(r, n)));
  })
  .get("/:id", async (c) => {
    const [row] = await inStudio(c, (tx) =>
      tx.select({ r: vendors, n: itemCount }).from(vendors).where(eq(vendors.id, c.req.param("id"))),
    );
    if (!row) throw notFound("That vendor");
    return c.json(toVendor(row.r, row.n));
  })
  .post("/", requirePermission("projects.edit"), async (c) => {
    const input = await body(c, vendorInput);
    const { studioId, userId } = c.var.session;
    const row = await inStudio(c, async (tx) => {
      const [r] = await tx.insert(vendors).values({ ...input, studioId }).returning();
      await audit(tx, { studioId, actorUserId: userId, action: "vendor.created", entityType: "vendor", entityId: r!.id, after: { name: r!.name } });
      return r!;
    });
    changed(c, ["vendors"]);
    return c.json(toVendor(row, 0), 201);
  })
  .post("/import", requirePermission("projects.edit"), async (c) => {
    const { csv, dryRun } = await body(c, vendorImportInput);
    const { studioId, userId } = c.var.session;
    const parsed = vendorsFromCsv(csv);
    const result: VendorImportResult = { created: 0, skipped: [], preview: [] };

    await inStudio(c, async (tx) => {
      const existing = new Set(
        (await tx.select({ name: vendors.name }).from(vendors)).map((v) => v.name.trim().toLowerCase()),
      );
      for (const p of parsed) {
        const valid = vendorInput.safeParse(p.input);
        const key = p.input.name.trim().toLowerCase();
        if (!valid.success || !p.input.name) {
          result.skipped.push({ row: p.row, name: p.input.name, reason: p.problem ?? valid.error?.issues[0]?.message ?? "Invalid row." });
          continue;
        }
        if (existing.has(key)) {
          result.skipped.push({ row: p.row, name: p.input.name, reason: "Already in your vendor list." });
          continue;
        }
        existing.add(key);
        result.preview.push(valid.data);
        if (!dryRun) await tx.insert(vendors).values({ ...valid.data, studioId });
      }
      if (!dryRun && result.preview.length) {
        result.created = result.preview.length;
        await audit(tx, { studioId, actorUserId: userId, action: "vendor.imported", entityType: "vendor", after: { count: result.created } });
      }
    });

    if (!dryRun) changed(c, ["vendors"]);
    return c.json(result);
  })
  .patch("/:id", requirePermission("projects.edit"), async (c) => {
    const input = await patchBody(c, vendorInput.partial());
    const row = await inStudio(c, async (tx) => {
      const [r] = await tx
        .update(vendors)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(vendors.id, c.req.param("id")))
        .returning();
      return r;
    });
    if (!row) throw notFound("That vendor");
    changed(c, ["vendors"], ["projects"], ["project"]);
    return c.json(toVendor(row, 0));
  })
  .delete("/:id", requirePermission("projects.edit"), async (c) => {
    const { studioId, userId } = c.var.session;
    await inStudio(c, async (tx) => {
      const [r] = await tx.delete(vendors).where(eq(vendors.id, c.req.param("id"))).returning();
      if (!r) throw notFound("That vendor");
      await audit(tx, { studioId, actorUserId: userId, action: "vendor.deleted", entityType: "vendor", entityId: r.id, before: { name: r.name } });
    });
    changed(c, ["vendors"], ["project"]);
    return c.body(null, 204);
  });
