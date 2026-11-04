# Vetted dependencies

No package is added without an entry here. A package qualifies when it has a company or core team
behind it, a release in the last six months, wide adoption and a good security record. Versions are
pinned exactly; Renovate proposes updates weekly and CI must pass to merge them.

Checked 2026-11-02.

## Tooling (dev only)

| Package                              | Version         | Why we use it                    | Maintained by                                      | Last release                                                 | License    | Exit plan                                        |
| ------------------------------------ | --------------- | -------------------------------- | -------------------------------------------------- | ------------------------------------------------------------ | ---------- | ------------------------------------------------ |
| typescript                           | 6.0.3           | Types                            | Microsoft                                          | Apr 2026 (final 6.x, see [ADR 001](adr/001-typescript-6.md)) | Apache-2.0 | Upgrade to 7                                     |
| @types/node                          | 24.19.2         | Node 24 types                    | DefinitelyTyped                                    | Oct 2026                                                     | MIT        | —                                                |
| eslint, @eslint/js                   | 10.14.0, 10.0.1 | Lint                             | OpenJS Foundation                                  | Oct 2026                                                     | MIT        | Biome, once it has boundary and type-aware rules |
| typescript-eslint                    | 8.72.1          | Type-aware lint rules            | typescript-eslint core team                        | Nov 2026                                                     | MIT        | —                                                |
| globals                              | 17.14.0         | Global names for JS config files | Sindre Sorhus, used by ESLint itself               | Nov 2026                                                     | MIT        | Inline the list                                  |
| prettier                             | 3.9.10          | Formatting                       | Prettier core team                                 | Oct 2026                                                     | MIT        | Biome formatter                                  |
| dependency-cruiser                   | 18.7.2          | Import boundaries                | Sander Verweij, active since 2016                  | Nov 2026                                                     | MIT        | ESLint import rules                              |
| vitest, @vitest/coverage-v8          | 5.1.0           | Tests and coverage               | Vitest team (VoidZero)                             | Nov 2026                                                     | MIT        | Node's test runner                               |
| fast-check                           | 4.10.2          | Property tests (random cases)    | Nicolas Dubien and contributors, active since 2017 | Sep 2026                                                     | MIT        | Hand-written generators                          |
| @stryker-mutator/core, vitest-runner | 10.1.1          | Mutation tests                   | Stryker team (Info Support), active since 2016     | Oct 2026                                                     | Apache-2.0 | Drop the check; coverage gates remain            |

## Considered and declined

| Package                | Why not                                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| eslint-config-prettier | No release since July 2025. Not needed: ESLint 10 ships no formatting rules, so nothing conflicts with Prettier. |
| TypeScript 7           | Not yet supported by typescript-eslint ([ADR 001](adr/001-typescript-6.md)).                                     |
