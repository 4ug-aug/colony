# Open threaded message search hits in their rail

Status: ready-for-agent

Type: AFK

User stories: 35–36

## Parent

[Room threads PRD](../PRD.md)

## What to build

Keep universal search message-only while making threaded Room messages
discoverable. A threaded hit carries its root identity and opens the accessible
Room, thread rail, and focused reply without injecting the reply into flat Room
history.

## Acceptance criteria

- [ ] Existing SQLite FTS5 indexing includes Room-message replies without adding a second index or service.
- [ ] Search continues to enforce public/private Room access and excludes runs, final results, Run Activity, room names, and attachments.
- [ ] Flat hits retain their current Room-focus behavior.
- [ ] Threaded hits include root identity and open the Room, its rail, and the matching focused reply.
- [ ] Loading a hit outside the current thread page preserves chronological pagination and rail scroll behavior.
- [ ] Editing a reply updates its searchable text through existing FTS synchronization.
- [ ] Store, HTTP, and client-navigation regression tests cover flat/thread hit distinction and inaccessible private Rooms.

## Blocked by

- [01 — Reply to a Room message in a basic thread](./01-human-room-thread.md)
