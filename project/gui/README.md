# Sweat client and server

`src/main.tsx` builds a static React client. `src/server/coordinator.ts` is the
authoritative HTTP/WebSocket server for authentication, shared public rooms,
durable room messages, and room-linked run control.

Every authenticated user shares `General` and can create and select additional
public rooms. Start a bounded software-engineer run by posting a message that
begins exactly with `@software-engineer `; its status and successful result
appear in that room's shared history. Realtime messages and run updates are
room-scoped. The client is an inset, left-aligned room UI and remains ready
for a future Tauri wrapper without embedding server logic.

Private rooms, membership, invitations, room renaming/deletion, and Tauri
packaging are intentionally deferred.

From the repository root:

```bash
make dev
```

This serves the client on `http://localhost:3000` and the API on
`http://localhost:3001`. Set `VITE_SWEAT_API_URL` when the client should use a
different server.

`make dev` also creates these local accounts (safe to run repeatedly):

| Name | Email | Password |
| --- | --- | --- |
| Admin | `admin@sweat.local` | `change-me-now` |
| Teammate | `teammate@sweat.local` | `change-me-now` |

Override them with `ADMIN_EMAIL` / `ADMIN_PASSWORD` and `MEMBER_EMAIL` /
`MEMBER_PASSWORD` when invoking `make`.

Useful checks:

```bash
make build
make check
```
