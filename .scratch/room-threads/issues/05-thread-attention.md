# Target Thread Attention without marking the Room unread

Status: ready-for-agent

Type: AFK

User stories: 29–34

## Parent

[Room threads PRD](../PRD.md)

## What to build

Make replies discoverable to the root author and prior Account participants
through durable Thread Attention while keeping ordinary thread activity out of
the flat Room unread model. Aggregate thread targets into the Room sidebar
badge and acknowledge only the thread the Account actually opens.

## Acceptance criteria

- [ ] A reply creates Thread Attention for the root author and prior Account reply authors, excluding the reply author.
- [ ] Agent definitions are never Attention recipients; exact Account mentions retain their existing behavior.
- [ ] Failed and cancelled Room-linked runs direct terminal Attention to their requester without creating a reply.
- [ ] Thread Attention stores enough root identity to open the correct rail and is aggregated into the Room sidebar badge.
- [ ] Opening the target thread acknowledges its Attention; opening only the Room or another thread does not.
- [ ] Generic flat Room unread calculations and latest-message markers exclude thread replies.
- [ ] Live badge events do not auto-ack merely because the containing Room is visible.
- [ ] Store, HTTP, stream, and notification-helper tests cover recipient sets, idempotency, aggregation, and acknowledgement isolation.

## Blocked by

- [01 — Reply to a Room message in a basic thread](./01-human-room-thread.md)
