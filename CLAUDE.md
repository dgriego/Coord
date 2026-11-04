# Coord

Coord is being rebuilt one slice at a time. Read these before starting work:

- [docs/rebuild-plan.md](docs/rebuild-plan.md): the approved plan, patterns and full slice list
- [docs/patterns.md](docs/patterns.md): the one way to do each thing; reuse it
- [docs/money-policy.md](docs/money-policy.md): the money rules, tested exactly as written
- [docs/dependencies.md](docs/dependencies.md): only actively maintained, proven packages get in
- [PLAN.md](PLAN.md): the product itself

## How each slice runs

1. Write a brief from `docs/features/_template.md`. The user approves it before any code.
2. Build and test it. `npm run ci` must pass.
3. Demo it to the user. Ask before committing or pushing.

Work happens directly on `main`.

## Keep the roadmap current

The user tracks progress at https://claude.ai/artifact/TyvFjurV19Xc4WKEuRqaQy (artifact slug
`da801347-4c9b-4453-8020-605bad6971d2`). Its source is [docs/roadmap.html](docs/roadmap.html).

Whenever a slice changes step, in the same turn:

1. Update `UPDATED`, `CURRENT` and `DONE` at the top of the script in `docs/roadmap.html`.
2. Republish that file to the same artifact, using `get_artifact` for the current version.

## Working style

Don't wait silently on slow work. Check on it, and tell the user if something is running long.
