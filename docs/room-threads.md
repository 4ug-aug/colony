# Room threads

A Room thread is a focused conversation anchored to one root Room message. It
is a view over Room content, not a separate container or mini-Room.

## Conversation model

- A thread begins with the first reply; there is no explicit create action.
- The root remains in its original main-timeline position and threads never
  nest or bump the Room.
- Replies inherit the Room's access and retention and stay out of its flat
  timeline.
- The root summary shows reply count, recent participants, and latest-reply
  time; opening it shows the newest reply.
- A hover or keyboard-focus action with a message-bubble icon opens **Reply in
  thread** for any top-level message. The empty rail contains the complete root,
  attachment thumbnails, and composer; nothing is persisted until submission.
- The rail keeps the complete root at the top and shows replies chronologically
  beneath it. The root is not part of the reply count.
- The thread composer reuses Room mentions, formatting, attachments, and
  author-only editing.
- **Reply in thread** is keyboard-focusable and has a tap-accessible message
  action on touch layouts; hover is never required.
- One in-memory draft is kept per thread for the app session. Switching or
  closing rails preserves it, submission clears it, and no server-side draft
  is stored.

## Room-linked runs

- Agent invocation remains mention-driven, with one run from the first
  recognized agent mention in each message.
- A run does not receive conversation history automatically. For a top-level
  invocation, `workspace.read_messages` keeps its current flat Room scope; for
  a thread invocation, it returns the root and thread replies instead.
- A top-level invocation writes progress and its successful final result into
  a thread rooted at the triggering message. A thread invocation writes back
  into the same thread and never creates a nested thread.
- Every mention starts a fresh bounded run. Separate mention messages may run
  concurrently, with successful results ordered by completion time.
- Explicit agent progress messages and successful final results count as
  replies. Run activity, failed runs, and cancelled runs do not.
- A Run capsule stays beneath its triggering message. Failed and cancelled
  runs send terminal-run Attention to the requester for inspection there.

## Attention and search

- A new reply sends Thread Attention to the root author and prior Account
  participants except its author; explicit Account mentions still apply.
- Opening the thread acknowledges its Attention. Opening only the Room does
  not.
- Thread replies do not mark the flat Room unread. Relevant Thread Attention
  is aggregated onto the Room's sidebar badge and opens the target thread.
- Universal search indexes flat and threaded Room-message text, not runs,
  results, activity, or attachments. A threaded hit opens its Room and rail,
  focused on the matching reply.

## Rail behavior

- Only one thread is open at once.
- Wide windows use a right rail; narrow windows use a full-height sheet. This
  matches Run Activity behavior without requiring identical visual design.
- Choosing another thread plays the current rail's exit transition before the
  next rail's entrance.
- Opening Run Activity replaces the thread in the same surface. Back returns
  to the thread; the two rails never stack.
- Incoming replies follow the existing Room scroll behavior: auto-scroll while
  near the bottom; otherwise preserve position and show **New replies** to jump
  down.

## Out of scope

- Explicit thread follow or unfollow controls
- A workspace-wide Threads inbox
- Open, resolved, closed, or archived thread states
