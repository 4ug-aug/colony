# Workspace Docs for General Grill

## Description

Introduce workspace-owned **Doc** records: freeform markdown design writeups,
distinct from Issues and Bulletins. General Grills persist one Doc as their
lasting design-language artifact on successful completion (persistence wiring
in GRL-008).

Docs are not typed into glossary/ADR kinds. Code Grill does not use Docs for
its design-language sink (repository files instead).

## Why is this important?

General Grills (including non-engineering topics) need a durable home that is
not git and not an Issue. Typing Docs as ADR/glossary would couple Sweat to
engineering Skill file layouts.

## Acceptance Criteria

- [ ] Workspace Doc can be created, read, updated, and listed by members
- [ ] Doc body is freeform markdown (no required glossary/ADR schema)
- [ ] Doc is distinct from Bulletin and Issue description/deliverable in the
      domain model (`CONTEXT.md` **Doc**)
- [ ] No agent Bulletin-style gap: [NEEDS CLARIFICATION: whether agents get Doc
      tools in v1, or only the Grill completion path writes Docs]

## Additional Information (Optional)

- Parent: GRL-000
- Consumed by GRL-008
- ADR: none required beyond glossary; skip unless storage choice is surprising
