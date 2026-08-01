# Sweat

Sweat is a self-hosted multiplayer workspace where people delegate work to
isolated AI agents, follow it as it happens, and keep the results with the
conversation.

[![Watch the Sweat demo](./sweat-demo.png)](./sweat-demo.mov?raw=1)

_Click the preview to watch the demo._

## Vision

Sweat should feel like a shared place where people and agents work together,
not a dashboard for launching background processes. Teams organize work in
durable rooms, delegate bounded runs to visible agent roles, and retain tasks,
progress, results, and decisions as one shared record.

Each deployment owns its accounts, data, model configuration, integrations,
and sandboxed agent execution. The native Tauri app and browser client connect
to the same authoritative Sweat server.

Read [VISION.md](./VISION.md) for the product direction,
[CONTEXT.md](./CONTEXT.md) for the domain language, and
[docs/architecture.md](./docs/architecture.md) for the current architecture.

## Install

Sweat currently targets macOS. Running the server requires
[Bun](https://bun.com/docs/installation) and
[Apple Container](https://github.com/apple/container).

### Run the server

Download `sweat-server-<version>.tar.gz` from the
[latest release](https://github.com/4ug-aug/sweat-v2/releases/latest), extract
it, and open a terminal in the extracted directory:

```bash
cp .env.example .env.local
openssl rand -base64 32
```

Put the generated value in `.env.local` as `BETTER_AUTH_SECRET`. If another
machine will connect to the server, set `BETTER_AUTH_URL` to its reachable URL.
Then start Sweat:

```bash
container system start
(cd agent && container build -t sweat-agent:latest .)
bun src/server/coordinator.js
```

The server listens on port 3001 and prints a one-time setup token on first
startup.

### Install the desktop app

Download the universal macOS `.dmg` from the
[latest release](https://github.com/4ug-aug/sweat-v2/releases/latest), open it,
and drag Sweat into Applications. Connect it to the server URL and enter the
setup token to create the first administrator.

The current builds are not notarized. If macOS blocks the first launch,
Control-click Sweat, choose **Open**, then confirm.

## Development

```bash
cp .env.example .env.local
# Add a stable BETTER_AUTH_SECRET to .env.local
make dev
```

`make dev` migrates the database, builds the agent image, and starts an empty
invite-only workspace. Use `make dev-seeded` for two reusable local accounts,
or `make server` and `make gui` separately to exercise the desktop boundary.
Run `make help` for every development command.

To enable repository-backed software-engineer runs, authenticate the host
GitHub CLI and set `SWEAT_GITHUB_REPOSITORY`. Set `SWEAT_VERIFY_COMMAND` to
allow verified pull-request publishing.

Back up the SQLite database together with its sibling `attachments/`
directory.
