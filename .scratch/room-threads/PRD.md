# PRD: Room threads

Status: needs-triage

## Problem Statement

Room messages currently share one flat timeline. People cannot hold a focused
side conversation around a specific message, and Room-linked runs place their
results back into the flat Room even when the work belongs to one message.
This makes active Rooms noisy and makes it difficult for people and agents to
preserve the context of a particular question or task.

## Solution

Add Slack-like Room threads: a focused side rail rooted at one top-level Room
message. Human and agent replies remain within the Room's access boundary but
stay out of its flat timeline. Agent mentions keep the existing invocation
model while their progress and successful results are routed into the correct
thread. Thread Attention, universal message search, and responsive navigation
make replies discoverable without turning every thread reply into Room unread.

## User Stories

1. As an Account, I want to reply to a specific Room message, so that focused discussion does not interrupt the flat Room timeline.
2. As an Account, I want any top-level Room message to support replies, so that a separate thread-creation step is unnecessary.
3. As an Account, I want the thread root to remain in its original timeline position, so that later replies do not reorder Room history.
4. As an Account, I want a root summary with reply count, recent participants, and latest-reply time, so that I can judge thread activity before opening it.
5. As a keyboard user, I want **Reply in thread** to be focusable, so that hover is not required.
6. As a touch user, I want a tap-accessible reply action, so that I can start threads on narrow layouts.
7. As an Account, I want the complete root and its attachment thumbnails at the top of the rail, so that replies retain their source context.
8. As an Account, I want replies ordered chronologically, so that the focused conversation reads naturally.
9. As an Account, I want the root excluded from the reply total, so that the count represents actual responses.
10. As an Account, I want the full Room composer in a thread, so that formatting, mentions, attachments, and editing behave consistently.
11. As an Account, I want one in-memory draft per thread, so that switching threads does not discard unfinished text.
12. As an Account, I want thread drafts cleared after submission, so that sent text does not reappear.
13. As an Account reading live replies, I want automatic scrolling only while I am near the bottom, so that incoming messages do not pull me away from older content.
14. As an Account away from the bottom, I want a **New replies** control, so that I can jump to current discussion when ready.
15. As an Account, I want only one thread rail open at once, so that the Room remains usable.
16. As an Account, I want switching threads to transition the old rail out before the new one enters, so that the change of context is clear.
17. As an Account on a narrow window, I want a full-height thread sheet, so that the conversation has enough space.
18. As an Account, I want Run Activity to replace the thread within the same side surface, so that two rails never compete for space.
19. As an Account inspecting Run Activity, I want Back to return to the originating thread, so that I do not lose conversational context.
20. As an Account, I want a top-level agent mention to preserve today's invocation behavior, so that existing Room workflows continue working.
21. As an agent invoked at the top level, I want `workspace.read_messages` to retain its flat Room scope, so that I can request existing Room context when needed.
22. As an Account, I want a top-level Room-linked run's progress and successful result to appear in a thread rooted at its trigger, so that agent work does not flood the Room.
23. As an agent invoked in a thread, I want `workspace.read_messages` to return the root and replies, so that my optional context read is focused.
24. As an agent invoked in a thread, I want my message posts and successful result bound to that thread, so that I cannot accidentally reply elsewhere.
25. As an Account, I want each agent mention to start a fresh bounded run, so that Room threads do not create hidden warm sessions.
26. As an Account, I want separate mention messages to run concurrently, so that one agent does not block another.
27. As an Account, I want explicit agent progress messages and successful results counted as replies, so that the root summary reflects visible conversation.
28. As an Account, I want Run Activity excluded from reply counts, so that implementation detail is not mistaken for conversation.
29. As a requester, I want failed and cancelled runs to create no reply but still draw my Attention, so that failures are discoverable without polluting the thread.
30. As a root author or prior Account participant, I want Attention when someone else replies, so that I can return to the focused conversation.
31. As an Account, I want opening a thread to acknowledge its Attention, so that the badge reflects what I have actually viewed.
32. As an Account, I want merely opening the Room not to acknowledge Thread Attention, so that hidden replies are not marked seen.
33. As a Room member who has not participated, I do not want thread replies to mark the flat Room unread, so that unrelated side discussions stay quiet.
34. As an Account, I want Thread Attention aggregated onto the Room sidebar badge, so that relevant replies remain discoverable.
35. As an Account, I want universal search to include flat and threaded Room-message text, so that message location does not limit discovery.
36. As an Account selecting a threaded search hit, I want the Room, rail, and matching reply opened, so that I land on the result.
37. As a private-Room member, I want threads to inherit Room access, so that no second permission model can leak messages.
38. As an Account, I want threads to share the Room's retention and deletion lifecycle, so that focused discussion is not a separate durable object.
39. As an Account, I want replies to replies to stay in the same root thread, so that nested threads cannot fragment context.

## Implementation Decisions

- A Room thread is not a separate persisted entity. A reply stores an optional
  relationship to one top-level root Room message in the same Room; every
  reply points directly to that root, so nesting is structurally impossible.
- Extend the existing Room store as the deep persistence module for flat
  history, thread history, root summaries, participant lookup, Attention, and
  search metadata. Do not add a second repository or a new dependency.
- Flat Room history excludes thread replies. Thread history returns its root,
  Room-message replies, linked runs, and enough ordering metadata to interleave
  visible successful results chronologically.
- A thread becomes durable when its first Room-message reply or successful
  Room-linked result is persisted. Opening an empty composer creates no record.
- Root summaries are derived from durable replies and successful results;
  roots are not reordered and no manual counter is authoritative.
- Reply creation supports the existing multipart attachment path, author
  mentions, author-only text editing, live message events, and Room access
  checks. Thread events identify their root so clients do not append them to
  the flat timeline.
- Keep existing mention parsing: the first recognized agent mention in one
  message starts one bounded run. Separate messages may start concurrent runs.
- Extend Room run/grant context with the invocation root. Top-level runs keep
  Room-scoped `workspace.read_messages`; thread runs receive the root plus
  replies. `workspace.post_message` is platform-bound to the run's thread and
  does not accept an agent-selected destination.
- Keep successful final output on the Run record rather than duplicating it as
  a Room message. Present and count it as a Thread reply; progress messages are
  normal Room messages. Failed and cancelled runs never become replies.
- A Run capsule remains attached to its trigger. Opening Activity replaces the
  thread in the existing responsive rail/sheet surface and Back restores it.
- Thread participants are the root author and Accounts that authored replies;
  agent definitions are not Attention recipients. A reply creates Thread
  Attention for prior participants except its author, plus normal exact Account
  mention Attention.
- Thread Attention targets the root, is acknowledged only when that thread is
  opened, and contributes to the containing Room's aggregate badge. Generic
  flat Room unread calculations exclude thread replies.
- Reuse SQLite FTS5 for all Room messages, including thread replies. Search
  hits carry optional root identity so selection can open and focus the rail.
  Run results, Run Activity, room names, and attachments remain unindexed.
- Extend existing dashboard history state for the open root, focused reply,
  and nested Activity surface. Wide windows use a rail and narrow windows use
  a full-height sheet; only one side surface is visible.
- Thread drafts remain client-memory state keyed by root. Live scrolling uses
  the same near-bottom threshold behavior as the Room timeline.
- No new third-party package is required.

## Testing Decisions

- Tests assert external behavior at existing ports and HTTP/stream boundaries,
  not SQL strings or component implementation details.
- Room-store tests cover same-Room root validation, flat/thread separation,
  chronological history, summaries, participants, access inheritance,
  Attention acknowledgement, unread exclusion, and FTS metadata.
- Room hub and HTTP tests cover first reply, attachments, mentions, editing,
  pagination, unavailable roots, and private-Room authorization.
- Workspace MCP tests cover Room-scoped versus thread-scoped reads and prove
  that callers cannot redirect posts to another root or Room.
- Coordinator/run tests cover top-level and in-thread invocation routing,
  concurrent runs, successful-result counting, capsule triggers, and
  failed/cancelled terminal Attention.
- Client tests focus on pure navigation, notification, summary, draft, and
  scroll-state helpers. Existing Room notification, message grouping, store,
  coordinator, and workspace MCP tests are the prior art.
- Each vertical slice adds the smallest regression test that would fail if its
  end-to-end contract broke; no new test framework or fixture layer is needed.

## Out of Scope

- Nested threads
- Explicit thread creation records
- Direct **Ask agent** message actions; invocation remains mention-driven
- Warm agent sessions between mentions
- Agent-selected arbitrary thread destinations
- Explicit follow/unfollow controls
- A workspace-wide Threads inbox
- Open, resolved, closed, or archived thread states
- Server-side or cross-device draft persistence
- Searching final Run results or Run Activity
- Marking the flat Room unread for ordinary thread replies

## Further Notes

Canonical behavior is documented in `docs/room-threads.md`; domain terms live
in `CONTEXT.md`; ADR 0022 records the message-rooted model and invocation-bound
agent context. The implementation is split into six AFK-ready issues under
`issues/`, with issue 01 as the shared foundation.
