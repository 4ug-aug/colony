# Root Room threads in messages and bind runs to their invocation context

Room threads are a focused view over Room messages, represented by replies
linked to one root message rather than by a separate thread container; they
inherit the Room's access and lifetime and cannot nest. Room-linked runs bind
their message tools to the invocation context: top-level invocations retain
the flat Room read scope but write progress and successful results into a
thread rooted at the trigger, while thread invocations read and write that
existing thread. This avoids duplicating Room membership and lifecycle state,
prevents hidden threads from flooding unrelated agent context, and makes the
thread destination platform-controlled rather than agent-selected.
