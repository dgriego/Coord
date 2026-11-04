// Random checks over thousands of cases. Instead of re-running the same formula, each one states
// what must be true of a correct answer, so a mistake in the code can't also hide in the test.

import fc from "fast-check";
import { describe, expect, test } from "vitest";
import {
  MAX_CENTS,
  MAX_QUANTITY,
  MAX_RATE,
  MAX_SECONDS,
  cents,
  formatDuration,
  formatMoney,
  formatQuantity,
  formatRate,
  multiplyAndDivide,
  parseDuration,
  parseMoney,
  parseQuantity,
  parseRate,
  quantity,
  rate,
  seconds,
  split,
  sum,
} from "./index.ts";

const RUNS = { numRuns: 5000 };
const anyAmount = fc.integer({ min: -MAX_CENTS, max: MAX_CENTS });
const anyMultiplier = fc.integer({ min: 0, max: 2_000_000 });
const anyDivisor = fc.constantFrom(1000, 3600, 1_000_000);

const fitsInRange = (a: number, b: number, divisor: number): boolean =>
  Math.abs(Number((BigInt(a) * BigInt(b)) / BigInt(divisor))) < MAX_CENTS;

const size = (value: bigint): bigint => (value < 0n ? -value : value);

describe("multiplyAndDivide", () => {
  test("is the closest whole cent to the exact answer", () => {
    fc.assert(
      fc.property(anyAmount, anyMultiplier, anyDivisor, (a, b, divisor) => {
        fc.pre(fitsInRange(a, b, divisor));
        const answer = BigInt(multiplyAndDivide(a, b, divisor));
        const distance = BigInt(a) * BigInt(b) - answer * BigInt(divisor);
        expect(2n * size(distance) <= BigInt(divisor)).toBe(true);
      }),
      RUNS,
    );
  });

  test("exact halves always land away from zero", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000_000 }), (whole) => {
        const onAHalf = 2 * whole + 1; // an odd number divided by 2 is always exactly on a half
        expect(multiplyAndDivide(onAHalf, 1, 2)).toBe(whole + 1);
        expect(multiplyAndDivide(-onAHalf, 1, 2)).toBe(-(whole + 1));
      }),
      RUNS,
    );
  });

  test("a credit is the exact mirror of the charge", () => {
    fc.assert(
      fc.property(anyAmount, anyMultiplier, anyDivisor, (a, b, divisor) => {
        fc.pre(fitsInRange(a, b, divisor));
        expect(multiplyAndDivide(-a, b, divisor) + multiplyAndDivide(a, b, divisor)).toBe(0);
      }),
      RUNS,
    );
  });
});

describe("split", () => {
  const anyWeights = fc.array(fc.integer({ min: 0, max: 100_000_000 }), {
    minLength: 1,
    maxLength: 50,
  });
  const anySplit = fc
    .tuple(anyAmount, anyWeights)
    .filter(([total, weights]) => total === 0 || weights.some((weight) => weight > 0));

  test("the pieces always add up to exactly the total", () => {
    fc.assert(
      fc.property(anySplit, ([total, weights]) => {
        expect(sum(split(cents(total), weights))).toBe(total);
      }),
      RUNS,
    );
  });

  test("each piece is within one cent of its exact share", () => {
    fc.assert(
      fc.property(anySplit, ([total, weights]) => {
        const totalWeight = BigInt(weights.reduce((a, b) => a + b, 0));
        fc.pre(totalWeight > 0n);
        split(cents(total), weights).forEach((piece, line) => {
          const share = BigInt(total) * BigInt(weights.at(line) as number);
          expect(size(BigInt(piece) * totalWeight - share) < totalWeight).toBe(true);
        });
      }),
      RUNS,
    );
  });

  test("extra cents go to the lines that lost the most, and ties to the earlier line", () => {
    const longWeights = fc.array(fc.integer({ min: 1, max: 100_000_000 }), {
      minLength: 64,
      maxLength: 200,
    });
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_CENTS }), longWeights, (total, weights) => {
        const totalWeight = BigInt(weights.reduce((a, b) => a + b, 0));
        const lines = split(cents(total), weights).map((piece, line) => {
          const exact = BigInt(total) * BigInt(weights.at(line) as number);
          return { line, lost: exact % totalWeight, gotExtra: BigInt(piece) > exact / totalWeight };
        });
        type Line = (typeof lines)[number];
        const outranks = (a: Line, b: Line): boolean =>
          a.lost > b.lost || (a.lost === b.lost && a.line < b.line);
        const strongestWithoutExtra = lines
          .filter((line) => !line.gotExtra)
          .reduce((best, line) => (outranks(line, best) ? line : best));
        const winners = lines.filter((line) => line.gotExtra);
        expect(winners.every((line) => outranks(line, strongestWithoutExtra))).toBe(true);
      }),
      { numRuns: 500 },
    );
  });

  test("the same input always gives the same pieces", () => {
    fc.assert(
      fc.property(anySplit, ([total, weights]) => {
        expect(split(cents(total), weights)).toEqual(split(cents(total), weights));
      }),
      RUNS,
    );
  });
});

describe("text round trips", () => {
  test("money", () => {
    fc.assert(
      fc.property(anyAmount, (value) => {
        expect(parseMoney(formatMoney(cents(value)))).toEqual({ ok: true, value });
      }),
      RUNS,
    );
  });

  test("rates", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_RATE }), (value) => {
        expect(parseRate(formatRate(rate(value)))).toEqual({ ok: true, value });
      }),
      RUNS,
    );
  });

  test("quantities", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_QUANTITY }), (value) => {
        expect(parseQuantity(formatQuantity(quantity(value)))).toEqual({ ok: true, value });
      }),
      RUNS,
    );
  });

  test("durations", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: MAX_SECONDS }), (value) => {
        expect(parseDuration(formatDuration(seconds(value)))).toEqual({ ok: true, value });
      }),
      RUNS,
    );
  });
});
