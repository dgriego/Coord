// Known right answers, written out by hand. Every example from docs/money-policy.md and every case
// the old app got wrong lives here. If one of these changes, the policy must have changed first.

export interface Fixture {
  readonly name: string;
  readonly a: number;
  readonly b: number;
  readonly divisor: number;
  readonly expected: number;
  /** What the old app's fractional math returned, where it was wrong. */
  readonly oldAppAnswer?: number;
}

const MILLION = 1_000_000;

export const fixtures: readonly Fixture[] = [
  // Bugs found in the old app
  {
    name: "$102.50 at 15% markup",
    a: 10250,
    b: 1_150_000,
    divisor: MILLION,
    expected: 11788,
    oldAppAnswer: 11787,
  },
  {
    name: "$102.45 less 30%",
    a: 10245,
    b: 700_000,
    divisor: MILLION,
    expected: 7172,
    oldAppAnswer: 7171,
  },
  {
    name: "$1.00 at 0.5% markup",
    a: 100,
    b: 1_005_000,
    divisor: MILLION,
    expected: 101,
    oldAppAnswer: 100,
  },
  { name: "2.3 yd at $1.05", a: 105, b: 2300, divisor: 1000, expected: 242, oldAppAnswer: 241 },
  { name: "1.15 yd at $1.10", a: 110, b: 1150, divisor: 1000, expected: 127, oldAppAnswer: 126 },
  {
    // The old app stored whole basis points, so 8.875% was saved as 8.88%.
    name: "8.875% tax on $1,000.00",
    a: 100_000,
    b: 88_750,
    divisor: MILLION,
    expected: 8875,
    oldAppAnswer: 8880,
  },

  // Examples from the money policy
  { name: "§3 line with a whole quantity", a: 11788, b: 4000, divisor: 1000, expected: 47152 },
  { name: "§3 sales tax on the sofa", a: 1_080_000, b: 82_500, divisor: MILLION, expected: 89100 },
  { name: "§3 deposit on the sofa", a: 1_169_100, b: 500_000, divisor: MILLION, expected: 584550 },
  { name: "§5 Rule B deposit", a: 1_000_000, b: 500_000, divisor: MILLION, expected: 500000 },
  { name: "§7 7.5 h at $150.00", a: 15000, b: 27_000, divisor: 3600, expected: 112500 },

  // Edges
  { name: "zero amount", a: 0, b: 82_500, divisor: MILLION, expected: 0 },
  { name: "zero rate", a: 12345, b: 0, divisor: MILLION, expected: 0 },
  { name: "half a cent rounds up", a: 1, b: 500_000, divisor: MILLION, expected: 1 },
  { name: "just under half a cent rounds down", a: 1, b: 499_999, divisor: MILLION, expected: 0 },
  { name: "a credit's half rounds away from zero", a: -11787, b: 1, divisor: 2, expected: -5894 },
  { name: "a credit just under half", a: -1, b: 499_999, divisor: MILLION, expected: 0 },
  {
    name: "the largest amount at 100%",
    a: 100_000_000_000,
    b: MILLION,
    divisor: MILLION,
    expected: 100_000_000_000,
  },
  {
    name: "a huge intermediate product stays exact",
    a: 99_999_999_999,
    b: 9_999_999,
    divisor: 9_999_999,
    expected: 99_999_999_999,
  },
];
