// The one way numbers become text (docs/money-policy.md §9). Everything is built from whole-number
// division and remainders, so a value is never pushed through a fraction just to be displayed.

import type { Cents, Quantity, Rate, Seconds } from "./types.ts";
import { THOUSANDTHS } from "./types.ts";

const MINUS = "−";
const PARTS_PER_PERCENT_DECIMAL = 10_000;
const groupedWholeNumber = new Intl.NumberFormat("en-US");

const twoDigits = (value: number): string => String(value).padStart(2, "0");

/** Shows the digits after the point, dropping trailing zeros: 8750 of 4 places is ".875". */
function fractionText(value: number, places: number): string {
  const digits = String(value).padStart(places, "0").replace(/0+$/, "");
  return digits === "" ? "" : `.${digits}`;
}

/** $1,234.56, or −$1,234.56 for a credit. */
export function formatMoney(amount: Cents): string {
  const size = Math.abs(amount);
  const dollars = groupedWholeNumber.format(Math.floor(size / 100));
  return `${amount < 0 ? MINUS : ""}$${dollars}.${twoDigits(size % 100)}`;
}

/** 8.875%, or 50% when no decimals are needed. */
export function formatRate(value: Rate): string {
  const whole = Math.floor(value / PARTS_PER_PERCENT_DECIMAL);
  return `${whole}${fractionText(value % PARTS_PER_PERCENT_DECIMAL, 4)}%`;
}

/** 2.3, or 4 when no decimals are needed. */
export function formatQuantity(value: Quantity): string {
  const whole = Math.floor(value / THOUSANDTHS);
  return `${whole}${fractionText(value % THOUSANDTHS, 3)}`;
}

/** 1:30 for an hour and a half, or 1:30:15 when there are seconds to show. */
export function formatDuration(value: Seconds): string {
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  const remainder = value % 60;
  const clock = `${hours}:${twoDigits(minutes)}`;
  return remainder === 0 ? clock : `${clock}:${twoDigits(remainder)}`;
}
