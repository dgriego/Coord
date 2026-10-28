import { asc, eq, inArray } from "drizzle-orm";
import { priceItem, type Item, type ItemComponent, type PricingInput, type PricingResult } from "@coord/shared";
import type { Tx } from "../db/client.ts";
import { itemComponents, items, vendors } from "../db/schema.ts";

type ItemRow = typeof items.$inferSelect;
type ComponentRow = typeof itemComponents.$inferSelect & { vendorName: string | null };

export interface TaxContext {
  taxRateBps: number;
  taxCharges: boolean;
  taxExempt: boolean;
}

/** Loads the parts of the given items, with vendor names, grouped by item. */
export async function loadComponents(tx: Tx, itemIds: string[]): Promise<Map<string, ComponentRow[]>> {
  const byItem = new Map<string, ComponentRow[]>();
  if (itemIds.length === 0) return byItem;
  const rows = await tx
    .select({ c: itemComponents, vendorName: vendors.name })
    .from(itemComponents)
    .leftJoin(vendors, eq(vendors.id, itemComponents.vendorId))
    .where(inArray(itemComponents.itemId, itemIds))
    .orderBy(asc(itemComponents.sort));
  for (const { c, vendorName } of rows) {
    const list = byItem.get(c.itemId) ?? [];
    list.push({ ...c, vendorName });
    byItem.set(c.itemId, list);
  }
  return byItem;
}

export function pricingFor(row: ItemRow, comps: ComponentRow[], tax: TaxContext): PricingResult {
  const input: PricingInput = {
    qty: row.qty,
    mode: row.pricingMode,
    markupBps: row.markupBps,
    marginBps: row.marginBps,
    msrpCents: row.msrpCents,
    msrpDiscountBps: row.msrpDiscountBps,
    fixedPriceCents: row.fixedPriceCents,
    components: comps,
    ...tax,
  };
  return priceItem(input);
}

/**
 * Shapes an item for one viewer. Without cost.view the response carries the
 * client price only: no cost, markup, parts or pricing breakdown (PLAN.md 7).
 * This is the only place items are serialized, so the rule can't be skipped.
 */
export function serializeItem(row: ItemRow, comps: ComponentRow[], tax: TaxContext, canViewCost: boolean): Item {
  const pricing = pricingFor(row, comps, tax);
  const vendorNames = [...new Set(comps.map((c) => c.vendorName).filter((n): n is string => Boolean(n)))];
  const base: Item = {
    id: row.id,
    projectId: row.projectId,
    roomId: row.roomId,
    name: row.name,
    description: row.description,
    category: row.category,
    sku: row.sku,
    dimensions: row.dimensions,
    finish: row.finish,
    qty: row.qty,
    unit: row.unit,
    status: row.status,
    procured: row.procured,
    specified: row.specified,
    tag: row.tag,
    imageUrl: row.imageUrl,
    sourceUrl: row.sourceUrl,
    notes: row.notes,
    vendorNames,
    msrpCents: row.msrpCents,
    unitPriceCents: pricing.unitPriceCents,
    totalCents: pricing.productPriceCents + pricing.chargesCents,
    updatedAt: row.updatedAt.toISOString(),
  };
  if (!canViewCost) return base;

  const components: ItemComponent[] = comps.map((c) => ({
    id: c.id,
    vendorId: c.vendorId,
    vendorName: c.vendorName,
    description: c.description,
    netCostCents: c.netCostCents,
    qty: c.qty,
    freightCents: c.freightCents,
    cratingCents: c.cratingCents,
    receivingCents: c.receivingCents,
    installCents: c.installCents,
    shipTo: c.shipTo,
  }));
  return {
    ...base,
    pricingMode: row.pricingMode,
    markupBps: row.markupBps,
    marginBps: row.marginBps,
    msrpDiscountBps: row.msrpDiscountBps,
    fixedPriceCents: row.fixedPriceCents,
    components,
    pricing,
  };
}

/** Keys that cost-blind roles must never receive. Used by tests. */
export const COST_FIELDS = [
  "pricingMode",
  "markupBps",
  "marginBps",
  "msrpDiscountBps",
  "fixedPriceCents",
  "components",
  "pricing",
  "totals",
] as const;
