# Parent cannot settle while a direct child is open

Status: done

Type: AFK

User stories: 13

## Parent

[Issue dispatch then integrate PRD](../PRD.md)

## What to build

An Issue cannot be In review or Done while a direct child is not. Reject that
status write in `updateIssue` so HTTP PATCH and MCP `workspace.update_issue`
both hit it. Tell the parent Task the same rule when a direct child is still
open. Do not add a new status, UI disable list, or child-create restriction.

## Acceptance criteria

- [x] `updateIssue` to In review or Done throws while any **direct** child is
      not In review or Done. Same error for Accounts and agents.
- [x] `updateIssue` to In review or Done succeeds when every direct child is
      In review or Done. Nested trees settle from the leaves up because each
      Issue is checked against its own direct children.
- [x] `updateIssue` to In review or Done succeeds when the Issue has no
      children.
- [x] Parent Task with an open direct child says not to set In review or Done
      yet. Integrate Task (all direct children settled) is unchanged.
- [x] Run start still moves the parent to In progress. Run success still does
      not change status.

## Seams

- `IssueStore.updateIssue` — the invariant.
- `buildIssueRunTask` — the Task sentence when a direct child is open.

## Blocked by

- [03 — Parent Issue integrate run on child settlement](./03-integrate-run.md)
