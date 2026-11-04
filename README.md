# Coord

Coord is design management for interior design studios: projects, items, proposals, purchasing,
time and billing, on the web and on your phone.

This branch is a **fresh rebuild**. The previous app (milestones M0–M2) is preserved at the
`legacy-m2` tag. The product itself is described in [PLAN.md](PLAN.md).

## First five minutes

```bash
nvm use        # Node 24, from .nvmrc
npm ci
npm run ci     # typecheck, lint, boundaries, tests with coverage, format check
```

If `npm run ci` is green, you're set up. The same checks run on GitHub for every push.

## How we build

Coord is built one small slice at a time. Each slice:

1. starts as a one-page brief in [docs/features](docs/features) that is approved before any code,
2. reuses the patterns in [docs/patterns.md](docs/patterns.md) (a new pattern needs an
   [ADR](docs/adr)),
3. adds only dependencies vetted in [docs/dependencies.md](docs/dependencies.md),
4. ships with tests, and ends with a demo.

## Rules the tooling enforces

| Rule                                                                                                              | Enforced by        |
| ----------------------------------------------------------------------------------------------------------------- | ------------------ |
| Strict TypeScript, no `any`, no unhandled promises                                                                | `tsc`, ESLint      |
| Functions of 40 lines or fewer, files of 250 or fewer                                                             | ESLint             |
| `money` imports nothing; `domain` imports only `money`; UI never fetches; apps never import each other; no cycles | dependency-cruiser |
| 100% coverage for `money` and `domain`, 90% elsewhere                                                             | Vitest             |
| Every injected bug in `money` is caught (at least 95%, target 100%)                                               | Stryker            |
| One formatting style                                                                                              | Prettier           |

## Layout

| Path        | What's there                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `packages/` | Shared code: money, domain rules, API contract, data hooks, design tokens, UI kits |
| `apps/`     | The API, the web app and the mobile app                                            |
| `docs/`     | Patterns, decisions (ADRs), vetted dependencies, feature briefs                    |
