import { describe, expect, it } from "vitest";
import { parseMoney, priceItem, type ComponentCost, type PricingInput } from "./pricing.ts";

const part = (netCostCents: number, extra: Partial<ComponentCost> = {}): ComponentCost => ({
  netCostCents,
  qty: 1,
  freightCents: 0,
  cratingCents: 0,
  receivingCents: 0,
  installCents: 0,
  ...extra,
});

const base: PricingInput = {
  qty: 1,
  mode: "markup",
  markupBps: 0,
  marginBps: 0,
  msrpCents: 0,
  msrpDiscountBps: 0,
  fixedPriceCents: 0,
  components: [],
  taxRateBps: 0,
  taxCharges: false,
  taxExempt: false,
};

// Fixture cases from PLAN.md M1 exit criteria: markup, margin, MSRP, COM, tax, freight.
describe("priceItem", () => {
  it("applies a markup on cost", () => {
    const r = priceItem({ ...base, markupBps: 3000, components: [part(100_000)] });
    expect(r.unitPriceCents).toBe(130_000);
    expect(r.profitCents).toBe(30_000);
    expect(r.marginBps).toBe(2308); // 30,000 / 130,000
  });

  it("prices to a target margin, which is not the same as markup", () => {
    const r = priceItem({ ...base, mode: "margin", marginBps: 3000, components: [part(100_000)] });
    expect(r.unitPriceCents).toBe(142_857); // 1,000 / 0.7
    expect(r.marginBps).toBe(3000);
  });

  it("prices from retail less a client discount", () => {
    const r = priceItem({ ...base, mode: "msrp_discount", msrpCents: 250_000, msrpDiscountBps: 1000, components: [part(150_000)] });
    expect(r.unitPriceCents).toBe(225_000);
    expect(r.profitCents).toBe(75_000);
  });

  it("uses a fixed price as given", () => {
    const r = priceItem({ ...base, mode: "fixed", fixedPriceCents: 99_900, components: [part(60_000)] });
    expect(r.unitPriceCents).toBe(99_900);
  });

  it("sums COM parts from different vendors into one client line", () => {
    // Custom sofa: frame and labor, plus 14 yd of fabric at $170/yd.
    const r = priceItem({
      ...base,
      markupBps: 6000,
      components: [
        part(620_000, { freightCents: 45_000, installCents: 12_500 }),
        part(17_000, { qty: 14, freightCents: 7_500 }),
      ],
    });
    expect(r.unitCostCents).toBe(858_000);
    expect(r.unitChargesCents).toBe(65_000);
    expect(r.unitPriceCents).toBe(1_372_800);
    expect(r.totalCents).toBe(1_372_800 + 65_000);
  });

  it("handles fractional yardage without sub-cent drift", () => {
    const r = priceItem({ ...base, markupBps: 3333, components: [part(4_999, { qty: 7.25 })] });
    expect(r.unitCostCents).toBe(36_243); // 362.4275 rounds to 362.43
    expect(r.unitPriceCents).toBe(48_323); // 36,243 x 1.3333 = 48,322.79
    expect(Number.isInteger(r.productPriceCents)).toBe(true);
  });

  it("multiplies after rounding so line totals equal unit price x qty", () => {
    const r = priceItem({ ...base, qty: 3, markupBps: 3333, components: [part(10_001)] });
    expect(r.productPriceCents).toBe(r.unitPriceCents * 3);
  });

  it("passes freight and other charges through at cost", () => {
    const r = priceItem({ ...base, qty: 2, markupBps: 5000, components: [part(40_000, { freightCents: 5_000, cratingCents: 2_000, receivingCents: 1_500 })] });
    expect(r.chargesCents).toBe(17_000);
    expect(r.profitCents).toBe(40_000);
  });

  it("taxes the product, and charges only when the state taxes them", () => {
    const input: PricingInput = { ...base, markupBps: 5000, taxRateBps: 825, components: [part(100_000, { freightCents: 10_000 })] };
    expect(priceItem(input).taxCents).toBe(12_375); // 8.25% of 1,500
    expect(priceItem({ ...input, taxCharges: true }).taxCents).toBe(13_200); // 8.25% of 1,600
  });

  it("charges no tax to exempt clients", () => {
    const r = priceItem({ ...base, markupBps: 5000, taxRateBps: 825, taxExempt: true, components: [part(100_000)] });
    expect(r.taxCents).toBe(0);
  });

  it("warns instead of dividing by zero for a 100% margin", () => {
    const r = priceItem({ ...base, mode: "margin", marginBps: 10_000, components: [part(5_000)] });
    expect(r.warnings).toContain("A margin must be under 100%.");
    expect(Number.isFinite(r.unitPriceCents)).toBe(true);
  });

  it("warns when the price is below cost", () => {
    const r = priceItem({ ...base, mode: "fixed", fixedPriceCents: 1_000, components: [part(5_000)] });
    expect(r.warnings).toContain("The client price is below your cost.");
    expect(r.marginBps).toBe(-40_000);
  });

  it("reports no margin for an unpriced item", () => {
    expect(priceItem(base).marginBps).toBeNull();
  });
});

describe("parseMoney", () => {
  it("reads common money formats", () => {
    expect(parseMoney("$1,234.5")).toBe(123_450);
    expect(parseMoney("80")).toBe(8_000);
    expect(parseMoney("12.345")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});
