# Route top-level Room-linked run output into its root thread

Status: ready-for-agent

Type: AFK

User stories: 20–22, 25–28

## Parent

[Room threads PRD](../PRD.md)

## What to build

Preserve current top-level mention invocation and flat Room message-reading
behavior while routing visible agent progress and successful final output into
a thread rooted at the triggering message. Keep Run Activity and failures on
the triggering Run capsule instead of treating them as replies.

## Acceptance criteria

- [ ] The first recognized agent mention in a top-level message still starts one fresh bounded Room-linked run.
- [ ] Its `workspace.read_messages` tool retains the current flat Room scope and does not automatically inject history into the Task.
- [ ] Agent `workspace.post_message` calls are stored as replies bound to the trigger root and cannot select another destination.
- [ ] A successful final result is displayed chronologically in the root thread and included in its reply count without duplicating it as a Room message.
- [ ] The Run capsule remains beneath the top-level trigger and Run Activity never affects the reply count.
- [ ] Separate mention messages may run concurrently and successful results order by completion time.
- [ ] Failed and cancelled runs create no reply or count increment and retain their inspectable capsule.
- [ ] MCP, coordinator, store-summary, and failure-path regression tests cover the complete routing contract.

## Blocked by

- [01 — Reply to a Room message in a basic thread](./01-human-room-thread.md)
