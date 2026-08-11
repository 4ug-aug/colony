# Invoke an agent inside an existing Room thread

Status: ready-for-agent

Type: AFK

User stories: 23–28

## Parent

[Room threads PRD](../PRD.md)

## What to build

Allow an Account to invoke an agent by mentioning it in a Thread reply. The
new bounded run receives thread-scoped message tools, posts and completes in
that same root thread, and attaches its Run capsule to the invoking reply
without creating a nested thread or retaining a warm provider conversation.

## Acceptance criteria

- [ ] The existing mention parser starts one fresh run from the first recognized agent mention in a Thread reply.
- [ ] `workspace.read_messages` returns the complete root plus chronological thread replies rather than the flat Room timeline.
- [ ] `workspace.post_message` and successful final output are bound to the invocation root and cannot be redirected by tool arguments.
- [ ] The Run capsule appears beneath the triggering reply and Activity replaces/restores the thread side surface.
- [ ] Explicit progress and successful final output count as replies; Activity, failure, and cancellation do not.
- [ ] Multiple separate mention replies can run concurrently without a per-thread or per-agent lock.
- [ ] Later mentions start new runs that re-read current thread state; no warm provider session survives.
- [ ] MCP, coordinator, authorization, and UI regression tests cover thread binding and attempted destination spoofing.

## Blocked by

- [03 — Route top-level Room-linked run output into its root thread](./03-top-level-run-results-in-thread.md)
