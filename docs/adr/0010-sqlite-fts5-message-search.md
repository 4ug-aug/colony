---
status: accepted
---

# Index room message search with SQLite FTS5

Universal message search must stay fast as a workspace accumulates history.
Cross-room substring matching via `LIKE '%query%'` cannot use a normal B-tree
index (leading wildcard) and would scan `room_message` on every keystroke.

Sweat already persists rooms in SQLite on the coordinator host. **SQLite FTS5**
is the search index for message text:

- Virtual table `room_message_fts` with external content linked to
  `room_message` (`content='room_message'`, `content_rowid='rowid'`)
- Triggers on INSERT / UPDATE OF `text` / DELETE keep the index aligned
- Migration `0015_room_message_fts.sql` creates the objects and backfills
  existing messages

The `RoomStore.searchMessages` port stays adapter-agnostic. Only
`createSqliteRoomStore` issues `MATCH` queries; it escapes user input into
safe tokenized prefix terms, filters to rooms the user can access after the
match, and always applies a hard `LIMIT`.

## Consequences

- New durable schema: FTS virtual table + triggers (no separate search service)
- Edit and delete paths stay correct because triggers update the index
- Host SQLite must include FTS5 (true for Bun SQLite and better-sqlite3 as wired
  today)
- Semantic / vector search remains out of scope
