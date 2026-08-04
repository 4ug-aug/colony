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

Clone the repository and run the setup wizard:

```bash
git clone https://github.com/4ug-aug/sweat-v2.git
cd sweat-v2
make setup
```

Choose **Server setup** to configure `.env.local`. The wizard generates the
authentication secret, asks for the server URL, browser origin, sandbox
runtime, and optional GitHub, Linear, and project-scoped Asana integrations. It preserves existing
values, backs up an existing environment file, installs dependencies, pulls the
CI-published agent image, and runs database migrations.

The server setup supports [Apple Container](https://github.com/apple/container)
and Docker. Install the selected runtime before running the wizard. Start the
configured server with `make server` or the local full stack with `make dev`.
Configure the model provider after first sign-in from Workspace Settings.

The agent image is published to GitHub Container Registry for each release and
must be publicly readable. To build the image from a local checkout instead,
set `SWEAT_AGENT_IMAGE=sweat-agent:latest` before running `make agent`.
After the first release, set `sweat-v2-agent` to Public in the package settings
if GitHub created it as private.

Choose **Install mac application** on macOS to download and open the latest
universal DMG. Drag Sweat into Applications, then connect it to the server URL
and enter the one-time setup token to create the first administrator.

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

To enable scoped Asana tasks, set both `ASANA_API_TOKEN` and
`ASANA_PROJECT_GID`. Use a dedicated service-account token with access only to
that project.

To let antboy search and write the Outline wiki, set both `OUTLINE_URL` (your
instance URL, without `/mcp`) and `OUTLINE_API_KEY`. Only antboy requests this
capability; the software engineer never receives it. Create the key under
Settings → API Keys with scopes
`documents.list documents.info documents.create documents.update collections.list`
(or leave scopes blank for full access). Missing scopes cause runs to fail with
`Granted MCP tools are unavailable`.

A self-hosted Outline behind an internal CA needs `NODE_EXTRA_CA_CERTS` set to
that CA bundle, or the coordinator fails with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`. The coordinator reaches Outline directly, so
this is the host's trust store; `SWEAT_AGENT_CA_CERT` covers only the agent
containers, which never contact Outline. `NODE_EXTRA_CA_CERTS` is read at
process start, so `make coordinator` picks it up from `.env.local` but a bare
`bun --env-file=… src/server/coordinator.ts` would not — export it instead.

Back up the SQLite database together with its sibling `attachments/`
directory.
