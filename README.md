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

On a Linux host with systemd, install the configured server as a background
user process:

```bash
make service-install
systemctl --user status sweat
journalctl --user -u sweat -f
```

The installer enables user lingering so Sweat starts at boot without an
interactive login. Use `systemctl --user start|stop|restart sweat` for normal
operation and `make service-uninstall` to remove it. The unit points at this
checkout and the Bun executable used during installation; rerun
`make service-install` after moving either one. `make server` remains the
foreground diagnostic command.

To upgrade a running source-checkout server, update the checkout explicitly,
then refresh its dependencies, agent image, unit paths, and process:

```bash
git pull --ff-only
make service-upgrade
```

`make service-upgrade` does not modify Git history.

The agent image is published to GitHub Container Registry for each release and
must be publicly readable. To build the image from a local checkout instead,
set `SWEAT_AGENT_IMAGE=sweat-agent:latest` before running `make agent`.
After the first release, set `sweat-v2-agent` to Public in the package settings
if GitHub created it as private.

Choose **Install mac application** on macOS to download and open the latest
universal DMG. Drag Sweat into Applications, then connect it to the server URL
and enter the one-time setup token to create the first administrator.

Windows has no wizard step because it needs none. Open the
[latest release](https://github.com/4ug-aug/sweat-v2/releases/latest) and run
`Sweat_<version>_x64_en-US.msi` (or `Sweat_<version>_x64-setup.exe` if you
prefer the NSIS installer). Both install Sweat and register the `sweat://`
invite scheme; then connect to the server URL the same way. A Windows machine
needs no clone, no `make`, and no container runtime — only the server host does.

The current builds are not signed. If macOS blocks the first launch,
Control-click Sweat, choose **Open**, then confirm. If Windows SmartScreen warns
about an unrecognized publisher, choose **More info**, then **Run anyway**.

### Diagnosing an installed build

Installed builds write a log you can ask a user to send back:

| Platform | Path |
| --- | --- |
| Windows | `%LOCALAPPDATA%\com.sweat.desktop\logs\Sweat.log` |
| macOS | `~/Library/Logs/com.sweat.desktop/Sweat.log` |

Startup logs an ordered `boot:` breadcrumb per phase, so the **last line decides
the diagnosis**:

| Last line | Meaning |
| --- | --- |
| `starting on <os>` only | The frontend bundle never ran at all. Look for the `startup script failed` line below it — the inline trap in `index.html` records the file and line, and reports a missing asset separately from a parse error. |
| `boot: module-loaded` | Startup never got past reading the stored server URL. |
| `boot: render-called` | Possible UI thread blocked mid-paint. Only meaningful for a window the user can actually see, since `requestAnimationFrame` is throttled while a window is hidden. |
| `boot: first-paint` | The app rendered; the problem is later (server reachability is the usual one). |

A blank white window with only the `starting on` line means the bundle failed to
parse or load. `build.target` in `vite.config.ts` pins a conservative syntax
floor per platform for that reason — Windows ships whatever WebView2 version the
machine happens to have.

Installers carry no web inspector. Run the **Debug Windows Build** workflow from
the Actions tab to get an installer with right-click → **Inspect** enabled.

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
instance URL, without `/mcp`) and `OUTLINE_API_KEY`, and enable MCP in Outline
under Settings → AI. Only antboy requests this capability; the software engineer
never receives it. Create the key under Settings → API Keys with scopes
`documents:read documents:write collections:read`; anything narrower fails the
session warm-up with `Granted MCP tools are unavailable`.

A self-hosted Outline behind an internal CA also needs `NODE_EXTRA_CA_CERTS` set
to that CA bundle, or the coordinator fails with
`UNABLE_TO_VERIFY_LEAF_SIGNATURE`. This is the host's trust store: the
coordinator reaches Outline directly, while `SWEAT_AGENT_CA_CERT` covers only
agent containers, which never contact Outline. Set it in `.env.local`.
`make service-install` / `make service-upgrade` hoist it into the systemd unit
`Environment=` so Bun sees it before TLS starts; a bare
`bun --env-file=… src/server/coordinator.ts` still reads it too late.

Back up the SQLite database together with its sibling `attachments/`
directory.
