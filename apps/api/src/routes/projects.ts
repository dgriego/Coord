import { Hono, type Context } from "hono";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  can,
  itemInput,
  itemPatch,
  PROJECT_COLORS,
  projectInput,
  roomInput,
  type ComponentInput,
  type Item,
  type ProjectDetail,
  type ProjectSummary,
} from "@coord/shared";
import { requirePermission, requireSession, type Env } from "../context.ts";
import { clients, itemComponents, items, projects, rooms, vendors } from "../db/schema.ts";
import type { Tx } from "../db/client.ts";
import { audit } from "../audit.ts";
import { body, HttpError, notFound, patchBody } from "../http.ts";
import { loadComponents, pricingFor, serializeItem, type TaxContext } from "../catalog/items.ts";
import { changed, inStudio, iso } from "./helpers.ts";

const PRICING_KEYS = ["pricingMode", "markupBps", "marginBps", "msrpCents", "msrpDiscountBps", "fixedPriceCents", "components"] as const;

const canCost = (c: Context<Env>) => can(c.var.session.role, "cost.view");

async function projectTax(tx: Tx, projectId: string): Promise<{ project: typeof projects.$inferSelect; tax: TaxContext }> {
  const [row] = await tx
    .select({ p: projects, exempt: clients.taxExempt })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(eq(projects.id, projectId));
  if (!row) throw notFound("That project");
  return {
    project: row.p,
    tax: { taxRateBps: row.p.taxRateBps, taxCharges: row.p.taxCharges, taxExempt: row.exempt ?? false },
  };
}

async function writeComponents(tx: Tx, studioId: string, itemId: string, comps: ComponentInput[]) {
  await tx.delete(itemComponents).where(eq(itemComponents.itemId, itemId));
  if (comps.length === 0) return;
  // Only vendors in this studio: RLS hides others, so an unknown id is rejected here.
  const vendorIds = [...new Set(comps.map((c) => c.vendorId).filter((v): v is string => !!v))];
  if (vendorIds.length) {
    const found = await tx.select({ id: vendors.id }).from(vendors).where(inArray(vendors.id, vendorIds));
    if (found.length !== vendorIds.length) throw new HttpError(400, "invalid_input", "One of those vendors wasn't found.");
  }
  await tx.insert(itemComponents).values(
    comps.map((c, sort) => ({
      studioId,
      itemId,
      vendorId: c.vendorId ?? null,
      description: c.description ?? "",
      netCostCents: c.netCostCents ?? 0,
      qty: c.qty ?? 1,
      freightCents: c.freightCents ?? 0,
      cratingCents: c.cratingCents ?? 0,
      receivingCents: c.receivingCents ?? 0,
      installCents: c.installCents ?? 0,
      shipTo: c.shipTo ?? "",
      sort,
    })),
  );
}

async function assertRoom(tx: Tx, projectId: string, roomId: string | null | undefined) {
  if (!roomId) return;
  const [r] = await tx.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.projectId, projectId)));
  if (!r) throw new HttpError(400, "invalid_input", "That room isn't part of this project.", { roomId: "Unknown room" });
}

async function itemResponse(c: Context<Env>, tx: Tx, itemId: string): Promise<Item> {
  const [row] = await tx.select().from(items).where(eq(items.id, itemId));
  if (!row) throw notFound("That item");
  const { tax } = await projectTax(tx, row.projectId);
  const comps = await loadComponents(tx, [row.id]);
  return serializeItem(row, comps.get(row.id) ?? [], tax, canCost(c));
}

/** Strips pricing input from roles that can't edit pricing. */
function allowedPricing<T extends Record<string, unknown>>(c: Context<Env>, input: T): T {
  if (can(c.var.session.role, "pricing.edit")) return input;
  const copy = { ...input };
  for (const k of PRICING_KEYS) delete copy[k];
  return copy;
}

export const projectRoutes = new Hono<Env>()
  .use(requireSession)

  .get("/", async (c) => {
    const { studioId, role } = c.var.session;
    const list = await c.var.deps.cache.get(studioId, role, "projects", () =>
      inStudio(c, async (tx) => {
        const rows = await tx
          .select({ p: projects, clientName: clients.name, exempt: clients.taxExempt })
          .from(projects)
          .leftJoin(clients, eq(clients.id, projects.clientId))
          .orderBy(desc(projects.updatedAt));
        const allItems = await tx.select().from(items).orderBy(asc(items.sort));
        const roomCounts = await tx
          .select({ projectId: rooms.projectId, n: sql<number>`count(*)::int` })
          .from(rooms)
          .groupBy(rooms.projectId);
        const comps = await loadComponents(tx, allItems.map((i) => i.id));
        return rows.map(({ p, clientName, exempt }): ProjectSummary => {
          const tax = { taxRateBps: p.taxRateBps, taxCharges: p.taxCharges, taxExempt: exempt ?? false };
          const mine = allItems.filter((i) => i.projectId === p.id);
          const proposed = mine
            .filter((i) => i.status !== "rejected" && i.procured)
            .reduce((sum, i) => {
              const r = pricingFor(i, comps.get(i.id) ?? [], tax);
              return sum + r.productPriceCents + r.chargesCents;
            }, 0);
          return {
            id: p.id,
            name: p.name,
            clientId: p.clientId,
            clientName,
            phase: p.phase,
            status: p.status,
            color: p.color,
            address: p.address,
            budgetCents: p.budgetCents,
            itemCount: mine.length,
            roomCount: roomCounts.find((r) => r.projectId === p.id)?.n ?? 0,
            previewImages: mine.map((i) => i.imageUrl).filter(Boolean).slice(0, 4),
            proposedCents: proposed,
            updatedAt: iso(p.updatedAt),
          };
        });
      }),
    );
    return c.json(list);
  })

  .post("/", requirePermission("projects.edit"), async (c) => {
    const { rooms: roomNames, ...input } = await body(c, projectInput);
    const { studioId, userId } = c.var.session;
    const id = await inStudio(c, async (tx) => {
      if (input.clientId) {
        const [cl] = await tx.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId));
        if (!cl) throw new HttpError(400, "invalid_input", "That client wasn't found.", { clientId: "Unknown client" });
      }
      // Without a chosen color, new projects take the next one in rotation.
      const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(projects);
      const color = input.color ?? PROJECT_COLORS[n % PROJECT_COLORS.length]!;
      const [p] = await tx.insert(projects).values({ ...input, color, studioId }).returning();
      const names = roomNames?.length ? roomNames : ["Living Room", "Kitchen", "Primary Bedroom"];
      await tx.insert(rooms).values(names.map((name, sort) => ({ studioId, projectId: p!.id, name, sort })));
      await audit(tx, { studioId, actorUserId: userId, action: "project.created", entityType: "project", entityId: p!.id, after: { name: p!.name } });
      return p!.id;
    });
    changed(c, ["projects"], ["clients"]);
    return c.json({ id }, 201);
  })

  .get("/:id", async (c) => {
    const projectId = c.req.param("id");
    const showCost = canCost(c);
    const detail = await inStudio(c, async (tx) => {
      const { project: p, tax } = await projectTax(tx, projectId);
      const [client] = p.clientId ? await tx.select({ name: clients.name }).from(clients).where(eq(clients.id, p.clientId)) : [];
      const roomRows = await tx.select().from(rooms).where(eq(rooms.projectId, projectId)).orderBy(asc(rooms.sort), asc(rooms.name));
      const itemRows = await tx.select().from(items).where(eq(items.projectId, projectId)).orderBy(asc(items.sort), asc(items.createdAt));
      const comps = await loadComponents(tx, itemRows.map((i) => i.id));
      const list = itemRows.map((i) => serializeItem(i, comps.get(i.id) ?? [], tax, showCost));

      const counted = list.filter((i) => i.status !== "rejected" && i.procured);
      const result: ProjectDetail = {
        id: p.id,
        name: p.name,
        clientId: p.clientId,
        clientName: client?.name ?? null,
        clientTaxExempt: tax.taxExempt,
        phase: p.phase,
        status: p.status,
        color: p.color,
        address: p.address,
        budgetCents: p.budgetCents,
        roomCount: roomRows.length,
        previewImages: itemRows.map((i) => i.imageUrl).filter(Boolean).slice(0, 4),
        taxRateBps: p.taxRateBps,
        taxCharges: p.taxCharges,
        defaultMarkupBps: p.defaultMarkupBps,
        itemCount: list.length,
        proposedCents: counted.reduce((s, i) => s + i.totalCents, 0),
        updatedAt: iso(p.updatedAt),
        rooms: roomRows.map((r) => ({ id: r.id, name: r.name, sort: r.sort })),
        items: list,
      };
      if (showCost) {
        const t = { costCents: 0, priceCents: 0, chargesCents: 0, taxCents: 0, profitCents: 0 };
        for (const i of counted) {
          t.costCents += i.pricing!.productCostCents;
          t.priceCents += i.pricing!.productPriceCents;
          t.chargesCents += i.pricing!.chargesCents;
          t.taxCents += i.pricing!.taxCents;
          t.profitCents += i.pricing!.profitCents;
        }
        result.totals = { ...t, marginBps: t.priceCents ? Math.round((t.profitCents / t.priceCents) * 10_000) : null };
      }
      return result;
    });
    return c.json(detail);
  })

  .patch("/:id", requirePermission("projects.edit"), async (c) => {
    const { rooms: _ignored, ...input } = await patchBody(c, projectInput.partial());
    const { studioId, userId } = c.var.session;
    const projectId = c.req.param("id");
    if (!can(c.var.session.role, "pricing.edit")) {
      delete input.taxRateBps;
      delete input.taxCharges;
      delete input.defaultMarkupBps;
      delete input.budgetCents;
    }
    await inStudio(c, async (tx) => {
      const [before] = await tx.select().from(projects).where(eq(projects.id, projectId));
      if (!before) throw notFound("That project");
      const [after] = await tx.update(projects).set({ ...input, updatedAt: new Date() }).where(eq(projects.id, projectId)).returning();
      const diff = Object.fromEntries(Object.keys(input).map((k) => [k, (after as Record<string, unknown>)[k]]));
      const prev = Object.fromEntries(Object.keys(input).map((k) => [k, (before as Record<string, unknown>)[k]]));
      await audit(tx, { studioId, actorUserId: userId, action: "project.updated", entityType: "project", entityId: projectId, before: prev, after: diff });
    });
    changed(c, ["projects"], ["project", projectId]);
    return c.body(null, 204);
  })

  .delete("/:id", requirePermission("projects.edit"), async (c) => {
    const { studioId, userId } = c.var.session;
    await inStudio(c, async (tx) => {
      const [p] = await tx.delete(projects).where(eq(projects.id, c.req.param("id"))).returning();
      if (!p) throw notFound("That project");
      await audit(tx, { studioId, actorUserId: userId, action: "project.deleted", entityType: "project", entityId: p.id, before: { name: p.name } });
    });
    changed(c, ["projects"], ["clients"]);
    return c.body(null, 204);
  })

  // ── Rooms ──
  .post("/:id/rooms", requirePermission("projects.edit"), async (c) => {
    const { name } = await body(c, roomInput);
    const projectId = c.req.param("id");
    const { studioId } = c.var.session;
    const room = await inStudio(c, async (tx) => {
      await projectTax(tx, projectId);
      const [{ next } = { next: 0 }] = await tx
        .select({ next: sql<number>`coalesce(max(${rooms.sort}) + 1, 0)::int` })
        .from(rooms)
        .where(eq(rooms.projectId, projectId));
      const [r] = await tx.insert(rooms).values({ studioId, projectId, name, sort: next }).returning();
      return { id: r!.id, name: r!.name, sort: r!.sort };
    });
    changed(c, ["project", projectId]);
    return c.json(room, 201);
  })

  // ── Items ──
  .post("/:id/items", requirePermission("projects.edit"), async (c) => {
    const raw = allowedPricing(c, await body(c, itemInput));
    const { components, vendorId, ...input } = raw;
    const projectId = c.req.param("id");
    const { studioId, userId } = c.var.session;
    const item = await inStudio(c, async (tx) => {
      const { project } = await projectTax(tx, projectId);
      await assertRoom(tx, projectId, input.roomId);
      const [{ next } = { next: 0 }] = await tx
        .select({ next: sql<number>`coalesce(max(${items.sort}) + 1, 0)::int` })
        .from(items)
        .where(eq(items.projectId, projectId));
      const [row] = await tx
        .insert(items)
        .values({ ...input, markupBps: input.markupBps ?? project.defaultMarkupBps, studioId, projectId, sort: next })
        .returning();
      const parts: ComponentInput[] = components ?? (vendorId !== undefined ? [{ vendorId, description: input.name }] : []);
      await writeComponents(tx, studioId, row!.id, parts);
      await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, projectId));
      await audit(tx, { studioId, actorUserId: userId, action: "item.created", entityType: "item", entityId: row!.id, after: { name: row!.name, projectId } });
      return itemResponse(c, tx, row!.id);
    });
    changed(c, ["projects"], ["project", projectId], ["vendors"]);
    return c.json(item, 201);
  });

export const roomRoutes = new Hono<Env>()
  .use(requireSession, requirePermission("projects.edit"))
  .patch("/:id", async (c) => {
    const { name } = await body(c, roomInput);
    const room = await inStudio(c, async (tx) => {
      const [r] = await tx.update(rooms).set({ name }).where(eq(rooms.id, c.req.param("id"))).returning();
      if (!r) throw notFound("That room");
      return r;
    });
    changed(c, ["project", room.projectId]);
    return c.json({ id: room.id, name: room.name, sort: room.sort });
  })
  .delete("/:id", async (c) => {
    const room = await inStudio(c, async (tx) => {
      const [r] = await tx.delete(rooms).where(eq(rooms.id, c.req.param("id"))).returning();
      if (!r) throw notFound("That room");
      return r;
    });
    changed(c, ["project", room.projectId]);
    return c.body(null, 204);
  });

export const itemRoutes = new Hono<Env>()
  .use(requireSession)
  .patch("/:id", requirePermission("projects.edit"), async (c) => {
    const { components, vendorId, ...input } = allowedPricing(c, await patchBody(c, itemPatch));
    const { studioId, userId } = c.var.session;
    const itemId = c.req.param("id");
    const item = await inStudio(c, async (tx) => {
      const [before] = await tx.select().from(items).where(eq(items.id, itemId));
      if (!before) throw notFound("That item");
      await assertRoom(tx, before.projectId, input.roomId);
      const { tax } = await projectTax(tx, before.projectId);
      const beforeComps = (await loadComponents(tx, [itemId])).get(itemId) ?? [];
      const beforePrice = pricingFor(before, beforeComps, tax);

      const [after] = await tx.update(items).set({ ...input, updatedAt: new Date() }).where(eq(items.id, itemId)).returning();
      if (components) await writeComponents(tx, studioId, itemId, components);
      else if (vendorId !== undefined && beforeComps.length <= 1) {
        // Cost-blind roles can change the vendor of a single-part item without touching its cost.
        if (beforeComps[0]) {
          await tx.update(itemComponents).set({ vendorId }).where(eq(itemComponents.id, beforeComps[0].id));
        } else {
          await writeComponents(tx, studioId, itemId, [{ vendorId, description: after!.name }]);
        }
      }
      await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, before.projectId));

      const afterComps = (await loadComponents(tx, [itemId])).get(itemId) ?? [];
      const afterPrice = pricingFor(after!, afterComps, tax);
      if (afterPrice.unitPriceCents !== beforePrice.unitPriceCents || afterPrice.unitCostCents !== beforePrice.unitCostCents || after!.qty !== before.qty) {
        await audit(tx, {
          studioId,
          actorUserId: userId,
          action: "item.pricing_changed",
          entityType: "item",
          entityId: itemId,
          before: { name: before.name, qty: before.qty, unitCostCents: beforePrice.unitCostCents, unitPriceCents: beforePrice.unitPriceCents },
          after: { name: after!.name, qty: after!.qty, unitCostCents: afterPrice.unitCostCents, unitPriceCents: afterPrice.unitPriceCents },
        });
      }
      return { projectId: before.projectId, item: serializeItem(after!, afterComps, tax, canCost(c)) };
    });
    changed(c, ["projects"], ["project", item.projectId], ["vendors"]);
    return c.json(item.item);
  })
  .delete("/:id", requirePermission("projects.edit"), async (c) => {
    const { studioId, userId } = c.var.session;
    const row = await inStudio(c, async (tx) => {
      const [r] = await tx.delete(items).where(eq(items.id, c.req.param("id"))).returning();
      if (!r) throw notFound("That item");
      await audit(tx, { studioId, actorUserId: userId, action: "item.deleted", entityType: "item", entityId: r.id, before: { name: r.name, projectId: r.projectId } });
      return r;
    });
    changed(c, ["projects"], ["project", row.projectId], ["vendors"]);
    return c.body(null, 204);
  });
