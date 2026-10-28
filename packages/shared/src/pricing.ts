// The pricing engine (PLAN.md 5, rule 4). One pure function used by the API
// (authoritative) and the web app (live preview while editing).
//
// Units: money is integer cents; percentages are basis points (6000 = 60%).
// Rounding: the client's unit price is rounded to the cent (half up) once,
// then multiplied by quantity, so line totals always equal unit x qty.

export const PRICING_MODES = ["markup", "margin", "msrp_discount", "fixed"] as const;
export type PricingMode = (typeof PRICING_MODES)[number];

export const PRICING_MODE_LABELS: Record<PricingMode, string> = {
  markup: "Markup on cost",
  margin: "Target margin",
  msrp_discount: "Retail less discount",
  fixed: "Fixed price",
};

export interface ComponentCost {
  /** Net (trade) cost per unit of this component, e.g. per yard of fabric. */
  netCostCents: number;
  /** Units of this component per one item, e.g. 14 yards. May be fractional. */
  qty: number;
  freightCents: number;
  cratingCents: number;
  receivingCents: number;
  installCents: number;
}

export interface PricingInput {
  qty: number;
  mode: PricingMode;
  markupBps: number;
  marginBps: number;
  msrpCents: number;
  msrpDiscountBps: number;
  fixedPriceCents: number;
  components: ComponentCost[];
  taxRateBps: number;
  /** Whether freight, crating, receiving and install are taxed (varies by state). */
  taxCharges: boolean;
  taxExempt: boolean;
}

export interface PricingResult {
  /** Product cost for one item, before charges. */
  unitCostCents: number;
  /** Freight, crating, receiving and install for one item, billed at cost. */
  unitChargesCents: number;
  unitPriceCents: number;
  productCostCents: number;
  productPriceCents: number;
  chargesCents: number;
  taxCents: number;
  /** What the client pays: product price + charges + tax. */
  totalCents: number;
  /** Product price minus product cost. Charges pass through at cost. */
  profitCents: number;
  /** Profit as a share of product price, in basis points. Null when the price is zero. */
  marginBps: number | null;
  /** Problems a designer should see, e.g. a margin of 100% or more. */
  warnings: string[];
}

const roundHalfUp = (n: number) => Math.round(n + Number.EPSILON * Math.sign(n));

export function priceItem(input: PricingInput): PricingResult {
  const warnings: string[] = [];
  const qty = Math.max(0, input.qty);

  let unitCost = 0;
  let unitCharges = 0;
  for (const c of input.components) {
    unitCost += c.netCostCents * c.qty;
    unitCharges += c.freightCents + c.cratingCents + c.receivingCents + c.installCents;
  }
  // Fractional component quantities (14.5 yd) can make sub-cent costs.
  unitCost = roundHalfUp(unitCost);

  let unitPrice: number;
  switch (input.mode) {
    case "markup":
      unitPrice = unitCost * (1 + input.markupBps / 10_000);
      break;
    case "margin":
      if (input.marginBps >= 10_000) {
        warnings.push("A margin must be under 100%.");
        unitPrice = unitCost;
      } else {
        unitPrice = unitCost / (1 - input.marginBps / 10_000);
      }
      break;
    case "msrp_discount":
      if (input.msrpCents <= 0) warnings.push("Enter a retail price to use this pricing mode.");
      unitPrice = input.msrpCents * (1 - input.msrpDiscountBps / 10_000);
      break;
    case "fixed":
      unitPrice = input.fixedPriceCents;
      break;
  }
  unitPrice = Math.max(0, roundHalfUp(unitPrice));
  if (unitPrice < unitCost) warnings.push("The client price is below your cost.");

  const productCost = unitCost * qty;
  const productPrice = unitPrice * qty;
  const charges = unitCharges * qty;
  const taxBase = productPrice + (input.taxCharges ? charges : 0);
  const tax = input.taxExempt ? 0 : roundHalfUp((taxBase * input.taxRateBps) / 10_000);
  const profit = productPrice - productCost;

  return {
    unitCostCents: unitCost,
    unitChargesCents: unitCharges,
    unitPriceCents: unitPrice,
    productCostCents: productCost,
    productPriceCents: productPrice,
    chargesCents: charges,
    taxCents: tax,
    totalCents: productPrice + charges + tax,
    profitCents: profit,
    marginBps: productPrice > 0 ? Math.round((profit / productPrice) * 10_000) : null,
    warnings,
  };
}

export function formatMoney(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function formatPct(bps: number | null): string {
  if (bps === null) return "—";
  return `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
}

/** "1,234.50" or "$1,234.50" → 123450. Returns null for anything unparseable. */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[$,\s]/g, "");
  if (!/^-?\d*(\.\d{0,2})?$/.test(clean) || clean === "" || clean === "-") return null;
  return Math.round(parseFloat(clean) * 100);
}
