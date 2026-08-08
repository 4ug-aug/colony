# Persist General Grill Doc on success

## Description

When a **General Grill** completes successfully, persist its lasting design
writeup as one workspace **Doc** (freeform markdown). Wire this to Grill
completion after Accounts have finished the design loop (and typically after or
alongside Issue confirm in GRL-007 — order:
[NEEDS CLARIFICATION: Doc-only success allowed with zero Issues? Assumed yes
if Accounts choose not to confirm an Issue tree]).

Abandoned/failed Grills must not leave Docs.

## Why is this important?

General Grill’s durable value is the Doc. Without this sink, the ephemeral
session produces nothing lasting for non-git work.

## Acceptance Criteria

- [ ] Successful General Grill creates (or finalizes) exactly one Doc with the
      agreed writeup content
- [ ] Abandon/failure creates no Doc
- [ ] Doc content is freeform markdown per GRL-002
- [ ] Participants can open the resulting Doc after the Grill is gone

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001, GRL-002, GRL-007 (for full loop; Doc-only path if allowed)
- Code Grill counterpart: GRL-011
