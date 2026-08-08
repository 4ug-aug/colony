# Issue branch binding + inheritance

## Description

Add optional **Issue branch** on Issues: a repository branch binding. When
unset, an Issue inherits the nearest ancestor’s Issue branch when one exists;
an explicit child branch overrides.

This is a general Issue capability (not Grill-only). Code Grills will write
bindings later (GRL-012). See ADR 0018.

Do not change PR publish targeting in this issue — that is GRL-010.

## Why is this important?

Without a first-class Issue↔branch seam, coding agents cannot reliably continue
on the initiative line produced by a Code Grill (or any other workflow that
sets the binding).

## Acceptance Criteria

- [ ] Issue model can store an optional branch binding (repo identity as
      available in v1 — workspace default repo constraints apply)
- [ ] Read path resolves effective branch: own binding or nearest ancestor
- [ ] Explicit child binding overrides inheritance
- [ ] APIs/MCP can set/clear the binding for Accounts and agents
      (`workspace.update_issue` accepts `branch`)
- [ ] Glossary/ADR 0018 reflected; no Grill dependency required to land this

## Additional Information (Optional)

- Parent: GRL-000
- Parallel-friendly with GRL-001
- Follow-on: GRL-010 (prepare + PR base), GRL-012 (Grill writes bindings)
