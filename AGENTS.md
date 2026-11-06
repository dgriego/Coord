# Coord

Every agent and every new engineer starts from these rules. Coord is being rebuilt one slice at
a time. Read these before starting work:

- [docs/rebuild-plan.md](docs/rebuild-plan.md): the approved plan, patterns and full slice list
- [docs/patterns.md](docs/patterns.md): the one way to do each thing; reuse it
- [docs/money-policy.md](docs/money-policy.md): the money rules, tested exactly as written
- [docs/dependencies.md](docs/dependencies.md): only actively maintained, proven packages get in
- [PLAN.md](PLAN.md): the product itself

## Engineering priorities

Money accuracy is a hard gate. After that, when these pull against each other, earlier wins.

1. **Client data stays private.** Collect only what a feature needs. Logs, error responses,
   bug reports, URLs and analytics never name anyone: no names, emails, phone numbers,
   addresses, tokens or amounts. Use opaque ids that don't say who a person is. TLS everywhere,
   secrets and sensitive files encrypted at rest, data removed when its account or studio is
   deleted.
2. **Never leak the studio's margins.** Cost and markup are stripped on the server for every
   client, vendor or limited view, with a test that fails if a forbidden field gets through.
3. **Deny by default.** Every endpoint declares a permission and audience; RLS backs it up. Least
   privilege for database roles, API keys and CI tokens. Secrets live in the platform secret
   store, never in code, the repo or logs.
4. **Test what can hurt.** Money and access get the deepest tests. For access, test every role
   against every endpoint, both allowed and denied, plus another studio's data and forbidden
   fields. For tokens: session and share-link tokens are random, stored only as hashes, sent in
   httpOnly cookies or SecureStore, expire, can be revoked, and are never logged. Everything else
   gets enough tests to change it safely.
5. **No wasted queries.** A fixed query count per endpoint (the query budget), an index for
   every column a query filters, joins or sorts on, no query that reads a whole table to find a
   few rows, and paginated lists.
6. **Easy to review, for Daniel and for agents.** One reviewable step at a time, such as a schema
   change or one endpoint with its tests, not a whole slice in one diff and not trivially small
   pieces. One pattern per concern, plain names, no cleverness.
7. **KISS.** The simplest thing that meets the rule. No abstraction before a second real use, no
   speculative options, layers or packages. This is about the technology, not the product: keep
   the stack small for 1 to 10 person studios (a cache, an extra service or a summary table comes
   only after a measurement shows the need), and spend the effort on features built around how
   interior designers actually work.

## How we write code

- Named exports only. A package's `src/index.ts` is its only re-export file; no other barrels.
- Validate external data where it crosses a trust boundary (request bodies, webhooks, uploads,
  environment variables), once, and pass typed values inward. Code inside trusts its types.
- No `as` casts to silence the compiler, no chained assertions (`as unknown as T`), no `any`,
  and no parameter typed `unknown` except at a trust boundary. The one allowed `as` is inside a
  branded type's checked constructor, such as `cents()` in `packages/money`.
- Don't write code you weren't asked for: no fallback branches for cases that can't happen, no
  `?? {}` or conditional spreads to dodge a type, no comments that restate the code.
- Functions up to 40 lines, files up to 250. Lint enforces both.

## Which tests to write

- Money and business rules: every rule in `docs/money-policy.md` as written, plus property tests
  with fast-check. Coverage is 100% there; mutation testing must stay green.
- Access: the full role-by-endpoint grid from priority 4, both allowed and denied.
- A bug fix comes with the test that would have caught it.
- Everything else: test behavior through the public entry point, enough to change it safely.
  Don't test the framework, private helpers or trivial getters.

## Commits

- Nothing is committed until lint, typecheck and the tests for what changed pass:
  `npm run typecheck && npm run lint && npx vitest run <changed paths>`. A slice also needs the
  full `npm run ci` before its demo.
- One reviewable step per commit (see priority 6).
- Subject: imperative, sentence case, no prefix, under 72 characters, saying what changed for
  the product ("Make schedule tags editable"). Body: why, and anything a reviewer must know.
- Ask Daniel before committing or pushing. Work happens directly on `main`.

## How each slice runs

1. Write a brief from `docs/features/_template.md`. Daniel approves it before any code.
2. Build and test it. `npm run ci` must pass.
3. Review your own work before the demo: bugs and logic errors, privacy and margin leaks, and
   query counts. Do a security pass on anything touching the database, auth or the network
   (injection, missing permission or RLS checks, SSRF, open endpoints, exposed secrets). Fix what
   you find, and list what you checked in the demo.
4. Demo it to Daniel. Ask before committing or pushing.

## Keep the roadmap current

Daniel tracks progress at https://claude.ai/artifact/TyvFjurV19Xc4WKEuRqaQy (artifact slug
`da801347-4c9b-4453-8020-605bad6971d2`). Its source is [docs/roadmap.html](docs/roadmap.html).

Whenever a slice changes step, in the same turn:

1. Update `UPDATED`, `CURRENT` and `DONE` at the top of the script in `docs/roadmap.html`.
2. Republish that file to the same artifact, using `get_artifact` for the current version.

## Working style

Don't wait silently on slow work. Check on it, and say so if something is running long.
