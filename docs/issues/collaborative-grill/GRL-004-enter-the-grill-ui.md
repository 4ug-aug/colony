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
- [ ] Submit round is explicit; frontier does not advance on ordinary chat
- [ ] Timeline narration is secondary and not required for submit
- [ ] Visibility rules honored (invite-only vs workspace-open)
- [ ] Idle recycle of the griller (GRL-005) feels seamless in the UI (no forced
      Resume click)

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001, GRL-003
- Soft-depends on: GRL-005, GRL-006 for full E2E
