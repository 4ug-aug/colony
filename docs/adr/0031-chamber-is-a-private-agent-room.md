---
status: accepted
---

# A Chamber is a private Room with one agent, and the way agents deliver to a person

Agents have no way to deliver work to a person. Schedule runs land on the
Schedules page without Attention, Issue runs finish unseen, and no agent tool
can address a person. The sidebar agent rows only drop an `@mention` chip into
whichever Room is open. Chat (ADR 0029) is private but reply-only: no
Attention, no threads, no room tools, and nothing but the account's own turn
can write into it. Nobody uses it.

A **Chamber** is a Room with `kind = 'chamber'` bound to one account and one
agent definition, at most one per pair, created lazily on first open or first
delivery. Because it is a Room it inherits threads, attachments, run cards,
Attention, live updates and search. Only its account can see it, admins
included; it is excluded from Room lists, mentionables and everyone else's
search. An archived agent's Chamber turns read-only and leaves the sidebar; a
private agent's Chamber exists only for its creator.

Inside a Chamber every message is a task for its agent, no mention needed. A
top-level message runs with the recent top-level history and answers
top-level; a thread reply runs with that thread and answers in the thread.
History uses the same budgeted injection as Room thread mentions. Each run's
final output, or a short failure note linking the run, is posted as an agent
message, so the transcript reads as a conversation and the next run's history
includes the answer. Every agent message raises Attention for the account.

Runs stay bounded (ADR 0022's spine, not ADR 0029's warm session). A message
sent while a run is active in the same conversation (the top-level stream, or
one thread) is a **Queued message**: persisted, shown as queued, cancellable.
When that run ends, however it ends, all queued messages go together as the
next run. Steering a live run is deferred.

Chambers are where agents deliver. A Schedule run's outcome goes to the
schedule creator's Chamber with that agent; an Issue run's outcome goes as a
short linked note to the account that assigned it. Runs without a Room
(Schedules, Oneshots, Issues) get `workspace.message_owner`, which posts
markdown text top-level in the responsible account's Chamber. Oneshots are not
delivered automatically; the person is watching the panel.

This supersedes the "using a Room as a DM" rejection in
[ADR 0029](0029-chat-linked-warm-runs.md). Chat, its warm runs and its tables
are removed without migration.

Rejected: upgrading Chat (it would rebuild Threads, Attention and agent posts
beside Rooms); a new non-Room entity (same duplication); many conversations
per agent (threads already split topics, and one Chamber per agent gives
deliveries one obvious destination); warm sessions per Chamber (more lifecycle
for latency we have not measured); running each queued message separately
(stale answers to messages already superseded); `message_owner` in Room runs
(a private ping from a shared Room surprises its members).
