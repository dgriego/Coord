// The four kinds of number Coord calculates with. Each is a whole number at runtime, and a distinct
// type at compile time, so a rate can never be passed where cents are expected.

declare const unit: unique symbol;
type WholeNumberOf<Unit extends string> = number & { readonly [unit]: Unit };

/** Money, in whole cents. $1,234.56 is 123456. */
export type Cents = WholeNumberOf<"cents">;

/** A percentage, in parts per million. 8.875% is 88750. */
export type Rate = WholeNumberOf<"rate">;

/** A quantity, in thousandths. 2.3 yards is 2300. */
export type Quantity = WholeNumberOf<"quantity">;

/** A length of time, in whole seconds. 1 hour 30 minutes is 5400. */
export type Seconds = WholeNumberOf<"seconds">;

export const MAX_CENTS = 100_000_000_000;
export const MAX_RATE = 10_000_000;
export const MAX_QUANTITY = 1_000_000_000;
export const MAX_SECONDS = 1_000_000_000;

export const PARTS_PER_MILLION = 1_000_000;
export const THOUSANDTHS = 1_000;

function assertWholeNumberWithin(value: number, min: number, max: number, label: string): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be a whole number from ${min} to ${max}, got ${value}`);
  }
}

export function cents(value: number): Cents {
  assertWholeNumberWithin(value, -MAX_CENTS, MAX_CENTS, "Cents");
  return value as Cents;
}

export function rate(value: number): Rate {
  assertWholeNumberWithin(value, 0, MAX_RATE, "Rate");
  return value as Rate;
}

export function quantity(value: number): Quantity {
  assertWholeNumberWithin(value, 0, MAX_QUANTITY, "Quantity");
  return value as Quantity;
}

export function seconds(value: number): Seconds {
  assertWholeNumberWithin(value, 0, MAX_SECONDS, "Seconds");
  return value as Seconds;
}
