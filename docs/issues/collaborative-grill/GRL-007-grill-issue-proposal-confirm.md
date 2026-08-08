# Wrap-up Issue proposal + Account confirm

## Description

At Grill wrap-up, the grilling agent proposes an Issue tree (titles,
descriptions, parent/child relationships, and any other fields the proposal
format supports). Accounts review: **confirm** creates the Issues, or
**push back** returns revision notes so the agent revises the proposal.

The Grill must not silently mint Issues without Account confirmation.

## Why is this important?

Closes the full grill loop into executable workspace work while keeping
“Accounts decide” intact for the breakdown, not only for frontier answers.

## Acceptance Criteria

- [ ] Agent can produce a structured Issue tree proposal against an active Grill
- [ ] Accounts can confirm (creates Issues) or send back for revision
- [ ] No Issues are created on abandon/failure
- [ ] Proposal/revise loop can run more than once until confirm or Grill end
- [ ] Created Issues follow existing Issue model (single owner unset or set only
      as specified in the proposal — [NEEDS CLARIFICATION: whether v1 proposals
      may assign owners/agents at confirm time])

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001
- Soft-depends on GRL-005 for agent-driven propose/revise inside the warm run
- Code Grill branch linking of confirmed Issues is GRL-012
