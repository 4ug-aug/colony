# Parent: Collaborative Grill

## Description

Deliver multiplayer, workspace-native **Grills**: ephemeral sessions where an
assigned agent (with a Grill Skill) interviews Accounts, decisions settle via
a structured **Grill frontier** + explicit round submit, and successful
completion produces durable artifacts — a freeform workspace **Doc** (General
Grill) and/or a materialized repository branch plus Issues (Code Grill), with
optional **Issue branch** bindings for later coding runs.

This parent tracks the child issues under `docs/issues/collaborative-grill/`.
It is not itself an implementation unit.

## Why is this important?

Sweat already has Rooms, Skills, and Issues, but not a first-class collaborative
design interview. Porting the grill-with-docs *goal* (agent/human alignment →
design language → work breakdown) into the workspace unlocks planning that
multiple Accounts can settle together without overloading Rooms or Issues.

## Acceptance Criteria

- [ ] Child issues GRL-001 through GRL-012 are completable independently per
      their dependency notes in `INDEX.md`
- [ ] Behavior matches `CONTEXT.md` Grill-related terms and ADRs 0018–0020
- [ ] No durable Grill transcript is required after successful completion
      (session hard-discards on abandon/failure)

## Additional Information (Optional)

- Skill body is replaceable; platform owns multiplayer loop
- v1 Code Grill uses the single workspace GitHub repo/base env (multi-repo
  picker later)
- Merging an Issue branch into the repository default base is out of band in v1
