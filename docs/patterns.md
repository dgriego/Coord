# Pattern registry

There is **one** way to do each of these things in Coord. Before writing new logic, find the
pattern here and reuse it. If none fits, propose a new one in an [ADR](adr) and get it approved
first.

Each entry is filled in by the slice that introduces it.

| Concern                                            | Pattern                                                                                                            | Introduced in             | Reference                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------- | ---------------------------------------- |
| Money arithmetic, parsing, formatting              | Whole-number types plus `multiplyAndDivide`, `split`, `parse*` and `format*`. Never do math on money any other way | 0.2                       | `packages/money`, `docs/money-policy.md` |
| API endpoint contract and query keys               | _pending_                                                                                                          | 0.3                       |                                          |
| Server handler (`implement`) and errors            | _pending_                                                                                                          | 0.3                       |                                          |
| Database access, RLS, audit, outbox                | _pending_                                                                                                          | 0.4                       |                                          |
| Live updates                                       | _pending_                                                                                                          | 0.5                       |                                          |
| Design tokens and atoms                            | _pending_                                                                                                          | 0.6                       |                                          |
| Client reads (`queries`) and writes (`useCommand`) | _pending_                                                                                                          | 0.7                       |                                          |
| Forms                                              | _pending_                                                                                                          | 0.7                       |                                          |
| Native app shell and version gate                  | _pending_                                                                                                          | 0.8                       |                                          |
| Authentication                                     | _pending_                                                                                                          | A1                        |                                          |
| Status machines                                    | _pending_                                                                                                          | first slice with a status |                                          |
| Documents (share page + PDF)                       | _pending_                                                                                                          | D2                        |                                          |
| Background jobs                                    | _pending_                                                                                                          | E2                        |                                          |
