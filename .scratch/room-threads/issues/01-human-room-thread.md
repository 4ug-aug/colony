# Reply to a Room message in a basic thread

Status: ready-for-agent

Type: AFK

User stories: 1–10, 37–39

## Parent

[Room threads PRD](../PRD.md)

## What to build

Deliver the first complete human Room-thread path. An Account can open **Reply
in thread** on any top-level Room message, submit a reply with the existing
composer, see the complete root and chronological replies in one responsive
side surface, and see the root's derived reply summary without the reply
appearing in the flat timeline. Threads inherit Room authorization and
lifecycle, point directly to one root, and cannot nest.

## Acceptance criteria

- [ ] Opening an empty thread persists nothing; the first submitted reply establishes the thread.
- [ ] A reply is linked directly to a top-level root in the same accessible Room, and invalid, cross-Room, or nested roots are rejected.
- [ ] Flat Room history excludes replies while thread history returns the complete root and chronological replies.
- [ ] The rail displays root text and attachment thumbnails, then replies; the root is excluded from reply count.
- [ ] The existing composer supports formatting, Account and agent mentions, attachments, and author-only reply editing.
- [ ] The root remains in place and shows derived reply count, recent participants, and latest-reply time.
- [ ] Live events identify the root and update the open rail and summary without appending replies to the flat timeline.
- [ ] Store and HTTP/stream regression tests cover the complete path and private-Room access.

## Blocked by

None - can start immediately
