// The one way typed, pasted or imported text becomes a number (docs/money-policy.md §9). Parsing
// never throws and never guesses: it returns a value, or a plain-language reason it can't.

import type { Cents, Quantity, Rate, Seconds } from "./types.ts";
import { MAX_CENTS, MAX_QUANTITY, MAX_RATE, MAX_SECONDS } from "./types.ts";
import { cents, quantity, rate, seconds } from "./types.ts";

export type Parsed<Value> =
  { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly reason: string };

const accept = <Value>(value: Value): Parsed<Value> => ({ ok: true, value });
const refuse = (reason: string): Parsed<never> => ({ ok: false, reason });

const SECONDS_PER_HUNDREDTH_OF_AN_HOUR = 36;

type Decimal = number | "not a number" | "too precise";

/**
 * Reads plain digits such as "12.5" as a whole number scaled up by `places` decimals (12500).
 * A huge input may lose exactness here, but every limit sits far below where that starts, so it is
 * still refused as too large by the caller.
 */
function readDecimal(text: string, places: number): Decimal {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return "not a number";
  const point = text.indexOf(".");
  const whole = point < 0 ? text : text.slice(0, point);
  const fraction = point < 0 ? "" : text.slice(point + 1);
  if (fraction.length > places) return "too precise";
  return Number(whole) * 10 ** places + Number(fraction.padEnd(places, "0"));
}

/** Removes US thousands separators when they're in the right places. Misplaced ones stay, and fail. */
function withoutGrouping(text: string): string {
  return /^\d{1,3}(,\d{3})+(\.\d*)?$/.test(text) ? text.replaceAll(",", "") : text;
}

/** Peels off accounting parentheses, a minus sign and a dollar sign, in either order. */
function readMoneyShape(text: string): { negative: boolean; digits: string } | null {
  const inParentheses = text.startsWith("(") && text.endsWith(")");
  const inner = inParentheses ? text.slice(1, -1).trim() : text;
  const signs = inner.split(/[-−]/).length - 1;
  if (signs > 1 || (inParentheses && signs > 0)) return null;
  return {
    negative: inParentheses || signs === 1,
    digits: withoutGrouping(inner.replace(/[-−]?\s*\$?\s*[-−]?\s*/, "")),
  };
}

/** Reads an amount of money: "$1,234.56", "-12" or "(12.00)". */
export function parseMoney(text: string): Parsed<Cents> {
  const trimmed = text.trim();
  if (trimmed === "") return refuse("Enter an amount.");

  const shape = readMoneyShape(trimmed);
  if (shape === null) return refuse(`"${trimmed}" isn't an amount we can read.`);

  const amount = readDecimal(shape.digits, 2);
  if (amount === "not a number") return refuse(`"${trimmed}" isn't an amount we can read.`);
  if (amount === "too precise") return refuse("That has too many decimals; cents go two deep.");
  if (amount > MAX_CENTS) return refuse("That amount is too large.");
  return accept(cents(shape.negative ? 0 - amount : amount)); // 0 - 0 stays 0, where -0 would not
}

/** Reads a percentage: "8.875%" or "8.875". */
export function parseRate(text: string): Parsed<Rate> {
  const trimmed = text.trim();
  if (trimmed === "") return refuse("Enter a percentage.");

  const value = readDecimal(trimmed.replace(/\s*%$/, ""), 4);
  if (value === "not a number") return refuse(`"${trimmed}" isn't a percentage we can read.`);
  if (value === "too precise") return refuse("Use at most four decimals.");
  if (value > MAX_RATE) return refuse("Percentages stop at 1,000%.");
  return accept(rate(value));
}

/** Reads a quantity: "2.3" or "4". */
export function parseQuantity(text: string): Parsed<Quantity> {
  const trimmed = text.trim();
  if (trimmed === "") return refuse("Enter a quantity.");

  const value = readDecimal(trimmed, 3);
  if (value === "not a number") return refuse(`"${trimmed}" isn't a quantity we can read.`);
  if (value === "too precise") return refuse("Use at most three decimals.");
  if (value > MAX_QUANTITY) return refuse("That quantity is too large.");
  return accept(quantity(value));
}

/** Reads a length of time: "1:30", "1:30:15", "1.5h", "1.5" (hours), "1h 30m" or "90m". */
export function parseDuration(text: string): Parsed<Seconds> {
  const trimmed = text.trim().toLowerCase();
  if (trimmed === "") return refuse("Enter a length of time.");

  const total = /^\d{1,10}:[0-5]\d(:[0-5]\d)?$/.test(trimmed)
    ? secondsFromClock(trimmed)
    : secondsFromUnits(trimmed);

  if (total === "not a number") return refuse(`"${trimmed}" isn't a time we can read.`);
  if (total === "too precise") return refuse("Use at most two decimals of an hour.");
  if (total > MAX_SECONDS) return refuse("That's too long for one entry.");
  return accept(seconds(total));
}

function secondsFromClock(text: string): number {
  const parts = text.split(":");
  const total = parts.reduce((sofar, part) => sofar * 60 + Number(part), 0);
  return parts.length === 2 ? total * 60 : total; // "1:30" is hours and minutes, not minutes and seconds
}

function secondsFromUnits(text: string): Decimal {
  const units = /^(?:([\d.]+)\s*h)?\s*(?:(\d{1,10})\s*m)?$/.exec(text);
  const hoursText = units === null ? text : units[1];
  const minutesText = units === null ? undefined : units[2];

  const hundredths = hoursText === undefined ? 0 : readDecimal(hoursText, 2);
  if (typeof hundredths === "string") return hundredths;
  return hundredths * SECONDS_PER_HUNDREDTH_OF_AN_HOUR + Number(minutesText ?? 0) * 60;
}
