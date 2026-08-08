# Code Grill materialize remote branch

## Description

On successful **Code Grill** completion, materialize design-language artifacts
into a **remote** repository branch (created/published at materialize time, not
live-committed each round). Bind the Grill at start to the workspace default
repository and a base ref (GRL-001); at materialize, publish CONTEXT/ADR-style
files (or whatever the attached Grill Skill directs) onto that session branch.

Abandoned/failed Grills publish nothing. Multi-repo picker is out of scope (use
workspace default GitHub repo/base).

## Why is this important?

Code Grill’s durable design language lives in git, not Sweat Docs. Today Sweat
only creates remote branches at PR time — materialize needs an earlier remote
ref so Issues can bind to something fetchable.

## Acceptance Criteria

- [ ] Successful Code Grill publishes a remote branch from the session’s base
      ref with materialized design-language files
- [ ] No remote branch published on abandon/failure
- [ ] File layout follows the grilling agent / Grill Skill conventions for that
      session (not hard-coded solely to today’s grill-with-docs paths if the
      Skill differs — [NEEDS CLARIFICATION: v1 default paths if Skill is silent])
- [ ] Session branch identity is available to GRL-012 for Issue binding
- [ ] Uses workspace default repo only in v1

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001, GRL-009 (model exists even if linking is GRL-012)
- Soft-depends on GRL-005 if materialize is a phase of the warm run
