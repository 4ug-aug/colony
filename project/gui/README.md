# Sweat client and server

`src/main.tsx` builds a static React client. `src/server/coordinator.ts` is the
authoritative HTTP/WebSocket server for authentication, the shared seeded
`General` room, durable room messages, and room-linked run control.

Every authenticated user shares `General`. Start a bounded software-engineer
run by posting a message that begins exactly with `@software-engineer `; its
status and successful result appear in the shared room history. The client is
an inset, left-aligned channel UI and remains ready for a future Tauri wrapper
without embedding server logic.

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
