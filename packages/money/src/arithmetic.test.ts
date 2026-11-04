import { describe, expect, test } from "vitest";
import { fixtures } from "./fixtures.ts";
import {
  MAX_CENTS,
  applyRate,
  cents,
  multiplyAndDivide,
  multiplyByQuantity,
  quantity,
  rate,
  split,
  sum,
} from "./index.ts";

describe("multiplyAndDivide", () => {
  test.each(fixtures)("$name", ({ a, b, divisor, expected }) => {
    expect(multiplyAndDivide(a, b, divisor)).toBe(expected);
  });

  test.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "refuses divisor %s",
    (divisor) => {
      expect(() => multiplyAndDivide(1, 1, divisor)).toThrow(
        `Divisor must be a positive whole number, got ${divisor}`,
      );
    },
  );

  test("accepts the largest safe divisor", () => {
    expect(multiplyAndDivide(1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(1);
  });

  test("accepts a divisor of one", () => {
    expect(multiplyAndDivide(2, 3, 1)).toBe(6);
  });

  test("refuses fractional inputs instead of rounding them", () => {
    expect(() => multiplyAndDivide(1.5, 1, 1)).toThrow(RangeError);
  });

  test("refuses a result outside the allowed range", () => {
    expect(() => multiplyAndDivide(MAX_CENTS, 2, 1)).toThrow(RangeError);
  });

  test("never returns negative zero", () => {
    expect(Object.is(multiplyAndDivide(-1, 1, 10), 0)).toBe(true);
  });
});

test("applyRate takes a percentage of an amount", () => {
  expect(applyRate(cents(1_080_000), rate(82_500))).toBe(89_100);
});

test("multiplyByQuantity prices a fractional quantity", () => {
  expect(multiplyByQuantity(cents(105), quantity(2300))).toBe(242);
});

describe("sum", () => {
  test("adds amounts, including credits", () => {
    expect(sum([cents(100), cents(-30), cents(5)])).toBe(75);
  });

  test("an empty list is zero", () => {
    expect(sum([])).toBe(0);
  });

  test("a running total may pass the limit if the final total comes back", () => {
    expect(sum([cents(MAX_CENTS), cents(MAX_CENTS), cents(-MAX_CENTS)])).toBe(MAX_CENTS);
  });

  test("refuses a total outside the allowed range", () => {
    expect(() => sum([cents(MAX_CENTS), cents(1)])).toThrow(RangeError);
  });
});

describe("split", () => {
  test("§4 example: $10.00 across three equal lines", () => {
    expect(split(cents(1000), [1, 1, 1])).toEqual([334, 333, 333]);
  });

  test("a credit splits as the mirror image of the charge", () => {
    expect(split(cents(-1000), [1, 1, 1])).toEqual([-334, -333, -333]);
  });

  test("leftover cents go to the biggest loss, not the earliest line", () => {
    expect(split(cents(100), [1, 2, 4])).toEqual([14, 29, 57]);
  });

  test("the loss order holds whichever way the lines are listed", () => {
    expect(split(cents(100), [4, 2, 1])).toEqual([57, 29, 14]);
  });

  test("ties go to the earlier line", () => {
    expect(split(cents(1), [1, 1])).toEqual([1, 0]);
  });

  test("a line with no weight receives nothing", () => {
    expect(split(cents(5), [0, 1, 0, 1])).toEqual([0, 3, 0, 2]);
  });

  test("a negative total never produces negative zero", () => {
    const [first, second] = split(cents(-1), [1, 1]);
    expect(first).toBe(-1);
    expect(Object.is(second, 0)).toBe(true);
  });

  test("zero splits into zeros, even with no weight", () => {
    expect(split(cents(0), [0, 0])).toEqual([0, 0]);
  });

  test("no lines and nothing to split is an empty list", () => {
    expect(split(cents(0), [])).toEqual([]);
  });

  test("refuses to lose money across lines with no weight", () => {
    const message = "Cannot split a non-zero amount across lines with no weight";
    expect(() => split(cents(1), [0, 0])).toThrow(message);
    expect(() => split(cents(1), [])).toThrow(message);
  });

  test.each([-1, 1.5, Number.NaN])("refuses weight %s", (weight) => {
    expect(() => split(cents(1), [weight])).toThrow(
      `Weights must be non-negative whole numbers, got ${weight}`,
    );
  });

  test("accepts a weight of zero alongside others", () => {
    expect(split(cents(1), [0, 1])).toEqual([0, 1]);
  });

  test("refuses a bad weight even when there is nothing to split", () => {
    expect(() => split(cents(0), [-1])).toThrow(RangeError);
  });
});
