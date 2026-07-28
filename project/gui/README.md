# Sweat client and server

`src/main.tsx` builds a static React client. `src/server/coordinator.ts` is the
authoritative HTTP/WebSocket server for authentication, public and private
rooms, durable room messages, membership, and room-linked run control.

Every authenticated user shares `General` and can create and select additional
public rooms. Private rooms are discoverable and accessible only to their
members. Mention `@software-engineer` in a message to start a bounded run; its
status and successful result appear in that room's shared history. Realtime
messages and run updates are room-scoped. The client is an inset, left-aligned
room UI and remains ready for a future Tauri wrapper without embedding server
logic.

Workspace admission is closed after the first administrator is created.
Administrators can create single-use invitations and suspend or restore
members. Room renaming/deletion and Tauri packaging remain deferred.

From the repository root:

```bash
cp .env.example .env.local
make dev
```

Add the model credentials and a stable `BETTER_AUTH_SECRET` to the root
`.env.local`. It is the only environment file used by the development commands.
`make dev` migrates the database, builds the agent image, and starts the client
on `http://localhost:3000` and API on `http://localhost:3001`. Set
`VITE_SWEAT_API_URL` there when the client should use a different server.

On an empty database, the coordinator prints a one-time setup token after it
starts. Paste it into the browser setup form to create the administrator. Use
`make rotate-setup-token` if that token is lost before setup completes.

For reusable local accounts, run `make dev-seeded` instead. It creates these
accounts safely and repeatedly:

| Name     | Email                  | Password        |
| -------- | ---------------------- | --------------- |
| Admin    | `admin@sweat.local`    | `change-me-now` |
| Teammate | `teammate@sweat.local` | `change-me-now` |

Override them with the `SWEAT_ADMIN_*` and `SWEAT_MEMBER_*` variables in the
root `.env.local`.

`make reset-admin-password` securely prompts for a new administrator password.

To run the server and client separately, as the Tauri application will:

```bash
# Terminal 1
make server

# Terminal 2
make gui
```

Useful checks:

```bash
make test
make build
make check
```
