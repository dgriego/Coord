import { defineConfig } from "vitest/config";

// Money and business rules must be fully covered; everything else nearly so.
const strict = { branches: 100, functions: 100, lines: 100, statements: 100 };
const standard = { branches: 90, functions: 90, lines: 90, statements: 90 };

export default defineConfig({
  test: {
    include: ["{packages,apps}/*/src/**/*.test.{ts,tsx}"],
    passWithNoTests: true,
    coverage: {
      provider: "v8",
      include: ["{packages,apps}/*/src/**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}"],
      thresholds: {
        "packages/money/src/**": strict,
        "packages/domain/src/**": strict,
        "{packages,apps}/*/src/**": standard,
      },
    },
  },
});
