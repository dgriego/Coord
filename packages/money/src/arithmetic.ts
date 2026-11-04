// Exact money arithmetic. Everything multiplies first and divides last using BigInt, so no step ever
// holds a fraction, and each result is rounded exactly once (docs/money-policy.md §2).

import type { Cents, Quantity, Rate } from "./types.ts";
import { PARTS_PER_MILLION, THOUSANDTHS, cents } from "./types.ts";

/** Divides and rounds half away from zero: 7/2 is 4, and -7/2 is -4. The divisor must be positive. */
function divideRoundingHalfAwayFromZero(dividend: bigint, divisor: bigint): bigint {
  // Stryker disable next-line EqualityOperator: zero is its own negative, so <= behaves the same.
  if (dividend < 0n) return -divideRoundingHalfAwayFromZero(-dividend, divisor);
  return (2n * dividend + divisor) / (2n * divisor);
}

/** Computes a × b ÷ divisor exactly, then rounds once to the cent. */
export function multiplyAndDivide(a: number, b: number, divisor: number): Cents {
  if (!Number.isSafeInteger(divisor) || divisor <= 0) {
    throw new RangeError(`Divisor must be a positive whole number, got ${divisor}`);
  }
  return cents(Number(divideRoundingHalfAwayFromZero(BigInt(a) * BigInt(b), BigInt(divisor))));
}

/** A percentage of an amount: 8.25% of $10,800.00 is $891.00. */
export function applyRate(amount: Cents, percentage: Rate): Cents {
  return multiplyAndDivide(amount, percentage, PARTS_PER_MILLION);
}

/** A unit price times a quantity: $1.05 × 2.3 yards is $2.42. */
export function multiplyByQuantity(unitPrice: Cents, amount: Quantity): Cents {
  return multiplyAndDivide(unitPrice, amount, THOUSANDTHS);
}

/** Adds amounts. Refuses a total outside the allowed range rather than returning a wrong one. */
export function sum(amounts: readonly Cents[]): Cents {
  let total = 0n;
  for (const amount of amounts) total += BigInt(amount);
  return cents(Number(total));
}

/**
 * Splits a total across lines in proportion to their weights, using the largest-remainder method
 * (docs/money-policy.md §4). The pieces always add up to exactly the total. Each line starts with
 * its share rounded down, then the leftover cents go to the lines that lost the most to rounding,
 * and ties go to the earlier line. A line with no weight never receives anything.
 */
export function split(total: Cents, weights: readonly number[]): Cents[] {
  const totalWeight = sumOfWeights(weights);
  if (total === 0) return weights.map(() => cents(0));
  if (totalWeight === 0n) {
    throw new RangeError("Cannot split a non-zero amount across lines with no weight");
  }

  const size = BigInt(Math.abs(total));
  const shares = weights.map((weight, line) => {
    const exact = size * BigInt(weight);
    return { line, roundedDown: exact / totalWeight, lost: exact % totalWeight };
  });

  const assigned = shares.reduce((sofar, share) => sofar + share.roundedDown, 0n);
  const leftover = Number(size - assigned);
  // Array.sort is stable and shares start in line order, so equal losses keep the earlier line first.
  const biggestLossFirst = [...shares].sort((a, b) => {
    // The JavaScript spec requires a positive result here. V8 only ever checks for a negative one,
    // so changing this line can't alter the outcome under Node, and no test could catch it.
    // Stryker disable next-line ConditionalExpression,EqualityOperator
    const bLostMore = Number(b.lost > a.lost);
    return bLostMore - Number(a.lost > b.lost);
  });
  const receivesExtraCent = new Set(biggestLossFirst.slice(0, leftover).map((share) => share.line));

  return shares.map(({ line, roundedDown }) => {
    const pieceSize = Number(roundedDown) + (receivesExtraCent.has(line) ? 1 : 0);
    // Stryker disable next-line EqualityOperator: a total of zero has already returned above.
    return cents(total < 0 ? 0 - pieceSize : pieceSize); // 0 - 0 stays 0, where -0 would not
  });
}

function sumOfWeights(weights: readonly number[]): bigint {
  let totalWeight = 0n;
  for (const weight of weights) {
    if (!Number.isSafeInteger(weight) || weight < 0) {
      throw new RangeError(`Weights must be non-negative whole numbers, got ${weight}`);
    }
    totalWeight += BigInt(weight);
  }
  return totalWeight;
}
