# Route top-level Room-linked run output into its root thread

Status: done

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

- [x] The first recognized agent mention in a top-level message still starts one fresh bounded Room-linked run.
- [x] Its `workspace.read_messages` tool retains the current flat Room scope and does not automatically inject history into the Task.
- [x] Agent `workspace.post_message` calls are stored as replies bound to the trigger root and cannot select another destination.
- [x] A successful final result is displayed chronologically in the root thread and included in its reply count without duplicating it as a Room message.
- [x] The Run capsule remains beneath the top-level trigger and Run Activity never affects the reply count.
- [x] Separate mention messages may run concurrently and successful results order by completion time.
- [x] Failed and cancelled runs create no reply or count increment and retain their inspectable capsule.
- [x] MCP, coordinator, store-summary, and failure-path regression tests cover the complete routing contract.

## Blocked by

- [01 — Reply to a Room message in a basic thread](./01-human-room-thread.md)
