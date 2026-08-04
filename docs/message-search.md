# Universal message search

Cross-room search of **message text** from the client command palette
(Cmd/Ctrl+K). The server owns matching; selecting a hit opens that room and
scrolls to the message, loading a history window around it when the message is
outside the default recent snapshot.

## Product surface

- **Open:** toolbar Search control (shows ⌘K / Ctrl+K) or Cmd/Ctrl+K anywhere,
  including while the composer is focused.
- **Match:** message `text` only (not room names, runs, steps, or attachments).
- **Scope:** every room the signed-in user can access (public rooms, or private
  rooms where they are a member).
- **Query rules:** at least two characters; results newest-first; default cap
  20 (API max 50).
- **Jump:** `openMessage(roomId, messageId)` — if the message is missing from
  the live snapshot, the client loads `GET /api/rooms/:id/messages?around=` and
  replaces the in-memory history page so `loadOlder` still paginates from the
  oldest loaded message.

In-room-only search chrome is intentionally out of scope while universal search
covers jump-to.

## API

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/search/messages?q=&limit=` | Session-auth; returns `{ hits }` for accessible rooms |
| `GET` | `/api/rooms/:id/messages?around=` | History page centered on a message (mutually exclusive with `cursor`) |

Hit shape: `messageId`, `roomId`, `roomName`, `author`, `text`, `createdAt`.

## Persistence dependency: SQLite FTS5

Search is not a client-side filter over loaded timeline pages. The SQLite
adapter indexes message text with **FTS5**:

- Virtual table `room_message_fts` (external content on `room_message`)
- INSERT / UPDATE / DELETE triggers keep the index in sync
- Migration `project/gui/drizzle/0015_room_message_fts.sql` creates the table,
  triggers, and backfills existing rows

The `RoomStore` port exposes `searchMessages` without FTS details; only the
SQLite adapter uses FTS5. In-memory test doubles may substring-match.

A leading-wildcard `LIKE '%q%'` was rejected: it cannot use a B-tree index and
degrades with history size. FTS5 keeps match cost roughly proportional to the
hit set plus the ACL join. See
[ADR 0010](./adr/0010-sqlite-fts5-message-search.md).

Operators need no extra packages beyond the existing SQLite build: FTS5 is a
standard SQLite extension enabled in Bun’s SQLite and better-sqlite3 as used by
the coordinator. Apply migrations on startup as today (`migrateDatabase` /
`make` migrate paths).

## Client modules

- Palette: `project/gui/src/features/rooms/message-search-command.tsx`
- Query: `project/gui/src/features/rooms/use-message-search.ts` (TanStack Query,
  debounced)
- Jump: `openMessage` / `focusMessageId` in `use-rooms.ts` + timeline highlight
- Toolbar affordance: `WindowToolbar` Search + `Kbd`
