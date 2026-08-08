# Grill invites create Attention

## Description

When an Account is invited to an invite-only Grill, create **Attention** aimed
at that Grill (not only Rooms). Acknowledging Attention clears the badge
without deleting the shared record, consistent with existing Attention
semantics.

Workspace-open Grills do not require invites for entry; Attention for those is
out of scope unless later product asks for it.

## Why is this important?

Invite-only Grills need the same “come back here” signal the workspace already
uses. A separate notification type was rejected (ADR 0019).

## Acceptance Criteria

- [ ] Inviting an Account to a Grill creates Attention targeting that Grill
- [ ] Attention UI/badge can deep-link or navigate into the Grill surface
- [ ] Acknowledge clears the badge without removing the Attention record’s
      meaning as today for Rooms
- [ ] Room Attention behavior remains intact
- [ ] Matches `CONTEXT.md` **Attention** and ADR 0019

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001
- Parallel-friendly with GRL-004
