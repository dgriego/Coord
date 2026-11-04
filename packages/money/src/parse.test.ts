import { describe, expect, test } from "vitest";
import { MAX_CENTS, parseDuration, parseMoney, parseQuantity, parseRate } from "./index.ts";

describe("parseMoney reads", () => {
  test.each([
    ["1234.56", 123456],
    ["$1,234.56", 123456],
    ["1,234.5", 123450],
    ["1,234,567.89", 123456789],
    ["1,234.", 123400],
    ["1,234", 123400],
    ["-12", -1200],
    ["−12", -1200],
    ["-$12", -1200],
    ["$-12", -1200],
    ["- $ 12", -1200],
    ["(12.00)", -1200],
    ["($12.00)", -1200],
    ["( 12 )", -1200],
    ["  $ 12 ", 1200],
    [".5", 50],
    ["12.", 1200],
    ["007", 700],
    ["0", 0],
    ["1000000000", MAX_CENTS],
    ["-1000000000.00", -MAX_CENTS],
    ["000000000000012", 1200],
  ])("%s", (text, expected) => {
    expect(parseMoney(text)).toEqual({ ok: true, value: expected });
  });

  test("negative zero as plain zero", () => {
    const parsed = parseMoney("-0");
    expect(parsed.ok && Object.is(parsed.value, 0)).toBe(true);
  });
});

describe("parseMoney refuses", () => {
  test.each([
    "1e3",
    "0x10",
    "1.250,00",
    "12abc",
    "abc",
    "--5",
    "-$-5",
    "(-5)",
    "(5",
    "5)",
    "(12.50",
    "12.50)",
    "5-",
    "$$5",
    "$",
    ".",
    "1.2.3",
    "1,2,3",
    "12,34",
    "1234,567",
    "1,234,56",
    "x1,234",
    "1,234x",
    "１２",
    "1 000",
    "Infinity",
    "NaN",
  ])("%s", (text) => {
    expect(parseMoney(text)).toEqual({
      ok: false,
      reason: `"${text}" isn't an amount we can read.`,
    });
  });

  test.each(["", "   "])("blank %j", (text) => {
    expect(parseMoney(text)).toEqual({ ok: false, reason: "Enter an amount." });
  });

  test("three decimals", () => {
    expect(parseMoney("12.345")).toEqual({
      ok: false,
      reason: "That has too many decimals; cents go two deep.",
    });
  });

  test.each(["1000000000.01", "99999999999", "-1000000000.01"])("too large %s", (text) => {
    expect(parseMoney(text)).toEqual({ ok: false, reason: "That amount is too large." });
  });
});

describe("parseRate", () => {
  test.each([
    ["8.875%", 88_750],
    ["8.875", 88_750],
    ["8.8125%", 88_125],
    ["8.875 %", 88_750],
    ["50", 500_000],
    ["0", 0],
    ["1000%", 10_000_000],
    [" 0.0001 ", 1],
  ])("reads %s", (text, expected) => {
    expect(parseRate(text)).toEqual({ ok: true, value: expected });
  });

  test.each([
    ["", "Enter a percentage."],
    ["  ", "Enter a percentage."],
    ["abc", `"abc" isn't a percentage we can read.`],
    ["-5", `"-5" isn't a percentage we can read.`],
    ["%", `"%" isn't a percentage we can read.`],
    ["5%%", `"5%%" isn't a percentage we can read.`],
    ["%5", `"%5" isn't a percentage we can read.`],
    ["1.00001", "Use at most four decimals."],
    ["1000.0001", "Percentages stop at 1,000%."],
    ["99999999999", "Percentages stop at 1,000%."],
  ])("refuses %j", (text, reason) => {
    expect(parseRate(text)).toEqual({ ok: false, reason });
  });
});

describe("parseQuantity", () => {
  test.each([
    ["2.3", 2300],
    ["4", 4000],
    [" 0.001 ", 1],
    ["1000000", 1_000_000_000],
  ])("reads %s", (text, expected) => {
    expect(parseQuantity(text)).toEqual({ ok: true, value: expected });
  });

  test.each([
    ["", "Enter a quantity."],
    [" ", "Enter a quantity."],
    ["two", `"two" isn't a quantity we can read.`],
    ["-1", `"-1" isn't a quantity we can read.`],
    ["1.2345", "Use at most three decimals."],
    ["1000000.001", "That quantity is too large."],
    ["99999999999", "That quantity is too large."],
  ])("refuses %j", (text, reason) => {
    expect(parseQuantity(text)).toEqual({ ok: false, reason });
  });
});

describe("parseDuration", () => {
  test.each([
    ["1:30", 5400],
    ["1:30:15", 5415],
    ["0:06", 360],
    ["1.5h", 5400],
    ["1.5 H", 5400],
    ["1.5", 5400],
    [".25", 900],
    ["1h 30m", 5400],
    ["1h30m", 5400],
    ["2 h 5 m", 7500],
    ["2h", 7200],
    ["90m", 5400],
    ["90 M", 5400],
    [" 90m ", 5400],
    ["0", 0],
    ["277777:46:40", 1_000_000_000],
  ])("reads %s", (text, expected) => {
    expect(parseDuration(text)).toEqual({ ok: true, value: expected });
  });

  test.each([
    ["", "Enter a length of time."],
    ["  ", "Enter a length of time."],
    ["soon", `"soon" isn't a time we can read.`],
    ["1:60", `"1:60" isn't a time we can read.`],
    ["1:5", `"1:5" isn't a time we can read.`],
    ["1:30:60", `"1:30:60" isn't a time we can read.`],
    ["x1:30", `"x1:30" isn't a time we can read.`],
    ["1:30x", `"1:30x" isn't a time we can read.`],
    ["-1h", `"-1h" isn't a time we can read.`],
    ["1..5h", `"1..5h" isn't a time we can read.`],
    ["1.5m", `"1.5m" isn't a time we can read.`],
    ["30m 1h", `"30m 1h" isn't a time we can read.`],
    ["1.555h", "Use at most two decimals of an hour."],
    ["1.555", "Use at most two decimals of an hour."],
    ["277777:46:41", "That's too long for one entry."],
    ["99999999999h", "That's too long for one entry."],
    ["9999999999m", "That's too long for one entry."],
  ])("refuses %j", (text, reason) => {
    expect(parseDuration(text)).toEqual({ ok: false, reason });
  });
});
