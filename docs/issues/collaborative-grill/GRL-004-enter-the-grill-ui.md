# Enter the Grill UI + frontier UX

## Description

Ship the **Enter the Grill** surface: start a Grill (agent, kind, visibility,
invites, Code base ref as needed), participate in an active Grill, and complete
rounds via hybrid UX — agent may narrate in a timeline, but the authoritative
UI is structured frontier cards (questions + shared answer drafts) with an
explicit **Submit round** control.

Support invite-only vs workspace-open listing/entry consistent with GRL-001 and
Attention entry points from GRL-006.

## Why is this important?

Without a dedicated Grill UX, the feature cannot deliver shared answering or
round discipline; Rooms are durable and the wrong noun for ephemeral grills.

## Acceptance Criteria

- [ ] Starter can enter a new Grill with required start fields
- [ ] Participants see current frontier questions and can edit shared answer
      drafts
- [ ] Focusing an available answer acquires an exclusive edit lease for that
      Grill presence; drafts and the editor's Account avatar update live for
      every participant
- [ ] Edit leases release on blur, navigation, or clean disconnect and expire
      after 4 seconds without activity; a focused presence renews its lease
      every 2 seconds
- [ ] Each Grill presence holds at most one edit lease; focusing another answer
      releases its previous lease
- [ ] A leased answer is read-only to other presences and identifies its editor
      by Account avatar and name; leases have no queue or takeover action
- [ ] While typing, the latest answer value is sent at most every 100 ms,
      persisted by the server, and broadcast to participants; blur flushes any
      pending value immediately
- [ ] Submit round is disabled while any answer edit lease is active and shows
      which Account is still editing
- [ ] Reconnect retries unacknowledged text only when the canonical draft is
      unchanged; conflicting local text remains recoverable and never
      overwrites another edit
- [ ] Every Account permitted to enter a Grill may edit and submit
- [ ] Submit round is explicit; frontier does not advance on ordinary chat
- [ ] Timeline narration is secondary and not required for submit
- [ ] Visibility rules honored (invite-only vs workspace-open)
- [ ] Idle recycle of the griller (GRL-005) feels seamless in the UI (no forced
      Resume click)

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001, GRL-003
- Soft-depends on: GRL-005, GRL-006 for full E2E
