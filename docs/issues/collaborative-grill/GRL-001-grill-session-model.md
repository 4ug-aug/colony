# Grill session model & API

## Description

Add the workspace **Grill** as an ephemeral session entity (not a Room): start
with assigned agent definition (must have a Grill Skill attached), kind
(Code | General), visibility (invite-only | workspace-open), and for Code Grill
a base ref on the workspace default repository.

Persist only while the Grill is active: participants, settled answers, current
**Grill frontier** (questions + shared answer drafts), and draft artifact state
needed for wrap-up. Support explicit round submit that advances the frontier.
Abandoned or failed Grills hard-discard all session working state (no partial
Docs, no published branch, no Issues). Many Grills may be active at once.

## Why is this important?

Everything else (UI, Attention, warm runs, materialize) hangs off a clear
session model and API. Without it, Grill collapses back into Room chat.

## Acceptance Criteria

- [ ] Accounts can create/list/get active Grills per visibility rules
- [ ] Start rejects agent definitions with no attached Skill (guidance Skill;
      not name-gated — any attached Skill counts)
- [ ] Code Grill start binds workspace default repo + chosen/confirmed base ref
- [ ] Shared answer drafts + round submit are represented in the model
- [ ] Hard discard clears session state with no durable leftover artifacts
- [ ] Domain language matches `CONTEXT.md` (**Grill**, **Code Grill**,
      **General Grill**, **Grill Skill**, **Grill frontier**)

## Additional Information (Optional)

- Parent: GRL-000
- Parallel-friendly with GRL-002 and GRL-009
- Follow-up run wiring is GRL-005 (this issue may expose a Grill id / state
  snapshot suitable for rehydration)
