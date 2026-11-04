import { describe, expect, test } from "vitest";
import type { Cents, Rate } from "./index.ts";
import {
  MAX_CENTS,
  MAX_QUANTITY,
  MAX_RATE,
  MAX_SECONDS,
  cents,
  quantity,
  rate,
  seconds,
} from "./index.ts";

describe.each([
  { name: "cents", make: cents, min: -MAX_CENTS, max: MAX_CENTS },
  { name: "rate", make: rate, min: 0, max: MAX_RATE },
  { name: "quantity", make: quantity, min: 0, max: MAX_QUANTITY },
  { name: "seconds", make: seconds, min: 0, max: MAX_SECONDS },
])("$name", ({ make, min, max }) => {
  test("accepts its limits", () => {
    expect(make(min)).toBe(min);
    expect(make(max)).toBe(max);
  });

  test("refuses anything past its limits", () => {
    expect(() => make(min - 1)).toThrow(RangeError);
    expect(() => make(max + 1)).toThrow(RangeError);
  });

  test.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s", (value) => {
    expect(() => make(value)).toThrow("must be a whole number");
  });
});

test("the limits match the money policy", () => {
  expect(MAX_CENTS).toBe(100_000_000_000);
  expect(MAX_RATE).toBe(10_000_000);
  expect(MAX_QUANTITY).toBe(1_000_000_000);
  expect(MAX_SECONDS).toBe(1_000_000_000);
});

test("each error names the kind, the range and the value", () => {
  expect(() => cents(0.5)).toThrow(
    "Cents must be a whole number from -100000000000 to 100000000000, got 0.5",
  );
  expect(() => rate(-1)).toThrow("Rate must be a whole number from 0 to 10000000, got -1");
  expect(() => quantity(-1)).toThrow(
    "Quantity must be a whole number from 0 to 1000000000, got -1",
  );
  expect(() => seconds(-1)).toThrow("Seconds must be a whole number from 0 to 1000000000, got -1");
});

test("the kinds can't be mixed up at compile time", () => {
  const charge = (amount: Cents): Cents => amount;
  const tax: Rate = rate(82_500);
  // @ts-expect-error A rate is not an amount of money.
  charge(tax);
  // @ts-expect-error A plain number has to go through cents() first.
  charge(100);
  expect(charge(cents(100))).toBe(100);
});
