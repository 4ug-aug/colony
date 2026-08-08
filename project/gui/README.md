# Sweat client and server

`src/main.tsx` builds a static React client. `src/server/coordinator.ts` is the
authoritative HTTP/WebSocket server for authentication, public and private
rooms, durable room messages, membership, and room-linked run control.

Every authenticated user shares `General` and can create and select additional
public rooms. Private rooms are discoverable and accessible only to their
members. Mention `@software-engineer` in a message to start a bounded run; its
status and successful result appear in that room's shared history. Realtime
messages and run updates are room-scoped. The client is an inset, left-aligned
room UI. The same client runs in the browser and inside the Tauri desktop shell
without embedding server logic.

Workspace admission is closed after the first administrator is created.
Administrators can create single-use invitations and suspend or restore
members. Room renaming/deletion remains deferred.

From the repository root:

```bash
make setup
make dev
```

The setup wizard creates the root `.env.local` and runs migrations. After
signing in, an administrator configures the model provider in Workspace
Settings. The root environment file is the only one used by the development
commands.
`make dev` migrates the database, builds local agent images for your machine,
and starts the client on `http://localhost:3010` and API on
`http://localhost:3011`. Set `VITE_SWEAT_API_URL` / `SWEAT_COORDINATOR_PORT`
when those should differ.

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

## Desktop app (Tauri)

The desktop app wraps this same React client and talks to a self-hosted
coordinator over HTTP and WebSocket. It needs the Rust toolchain (`rustup`) and,
on macOS, the Xcode command-line tools. From `project/gui`:

```bash
bun run tauri:dev     # launch the desktop window against the Vite dev server
bun run tauri:build   # produce a macOS .app / .dmg
```

On first launch the app asks for the Sweat server URL (for local development,
`http://localhost:3011` with a coordinator running) and remembers it. Unlike the
browser client, the desktop app runs its HTTP through Tauri's native cookie jar
and authenticates the realtime WebSocket with a short-lived ticket, so the
server does not need HTTPS. When any room has a sidebar attention or unread
marker, the macOS dock shows a presence badge (`1`); it clears when none
remain. See [ADR 0006](../../docs/adr/0006-tauri-packaging.md).

Useful checks:

```bash
make test
make build
make check
```
