import { expect, test } from "vitest";
import {
  MAX_CENTS,
  cents,
  formatDuration,
  formatMoney,
  formatQuantity,
  formatRate,
  quantity,
  rate,
  seconds,
} from "./index.ts";

test.each([
  [123456, "$1,234.56"],
  [-123456, "−$1,234.56"],
  [0, "$0.00"],
  [5, "$0.05"],
  [-5, "−$0.05"],
  [100, "$1.00"],
  [99, "$0.99"],
  [MAX_CENTS, "$1,000,000,000.00"],
])("money %i", (value, text) => {
  expect(formatMoney(cents(value))).toBe(text);
});

test.each([
  [88_750, "8.875%"],
  [88_125, "8.8125%"],
  [500_000, "50%"],
  [0, "0%"],
  [1, "0.0001%"],
  [5_000, "0.5%"],
  [10_000_000, "1000%"],
])("rate %i", (value, text) => {
  expect(formatRate(rate(value))).toBe(text);
});

test.each([
  [2300, "2.3"],
  [4000, "4"],
  [0, "0"],
  [1, "0.001"],
  [10, "0.01"],
  [1050, "1.05"],
])("quantity %i", (value, text) => {
  expect(formatQuantity(quantity(value))).toBe(text);
});

test.each([
  [5400, "1:30"],
  [0, "0:00"],
  [360, "0:06"],
  [5415, "1:30:15"],
  [59, "0:00:59"],
  [3600, "1:00"],
  [3599, "0:59:59"],
  [360000, "100:00"],
])("duration %i", (value, text) => {
  expect(formatDuration(seconds(value))).toBe(text);
});
