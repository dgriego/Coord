# 001: Pin TypeScript 6.0.3 instead of 7

- Status: Accepted
- Date: 2026-11-02

## Context

TypeScript 7 (the native compiler) is the latest release. typescript-eslint 8.72, the standard
TypeScript linter and the only way to get type-aware rules such as "no unhandled promises",
supports TypeScript `>=4.8.4 <6.1.0`. The previous codebase used TypeScript 7 and had no lint.

## Decision

Pin TypeScript 6.0.3, Microsoft's final JavaScript-based release, which the whole toolchain
(typescript-eslint, Vite, Expo, Storybook) supports. Renovate is told not to propose 7.

## Consequences

Type checking is slower than with 7, which will not matter at our size for a long time. Revisit as
soon as typescript-eslint supports TypeScript 7: lift the Renovate rule and upgrade in one PR.
