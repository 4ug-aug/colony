# Architecture

Sweat is a self-hostable platform for running isolated, on-demand agent
workers. A software engineer is one role, not a special platform mode.

## Product shape

Sweat is becoming a multiplayer workspace with shared rooms in which people
delegate work to agents, observe runs, and retain their results. The existing
agent definition, run, and sandbox boundaries remain the execution model
behind that experience.

## Model

```text
Agent definition  -> instructions, requested capabilities, runtime/image
Run/job            -> task, prepared inputs, granted capabilities
Sandbox            -> disposable execution environment
```

The runtime runs inside the sandbox. The host only creates, configures, and
removes the sandbox.

## Client and server

The self-hosted Sweat server is authoritative for authentication, workspace
data, run orchestration, persistence, and realtime subscriptions. Frontends
are static API clients:

```text
Web client ───┐
              ├── server API + realtime protocol ──> Sweat server
Tauri client ─┘
```

The future Tauri application is the intended primary daily client; the web
client remains a universally accessible alternative. Both share one React
client and one server contract. Tauri may provide native notifications, tray
status, deep links, and narrow local capabilities, but it does not embed the
server or create a second orchestration path.

## Current multiplayer boundary

One deployment acts as one implicit workspace. The server seeds `General` and
supports public rooms plus private rooms restricted to their members. It
persists room membership, messages, and room-linked run projections, then
broadcasts authorized room discovery, membership, snapshot, message, and run
changes over realtime connections.

```text
authenticated user -> durable room message
                   -> @software-engineer task (only at exact leading mention)
                   -> verify and copy that message's attachments into /work
                   -> bounded existing run executor
                   -> durable status/result projected back into that room
```

The static React client renders this as a left-aligned room timeline. A
request that delegates work retains a small attached agent-status badge; a
successful result becomes a later agent-authored message. Its inset sidebar
layout leaves a rounded, padded main surface and remains suitable for the
future Tauri shell. The client does not own room state or execution.

## Decisions

- Use a generic in-container Node/Bun runtime, backed by the OpenAI Agents SDK
  by default.
- Keep OpenAI-compatible model configuration provider-neutral:
  `{ provider, baseUrl, apiKey, model }` under Workspace → LLM provider.
- Offer Cursor as an optional **agent-runtime** adapter (`@cursor/sdk` in a
  dedicated Node 22.13+ image), configured under Workspace → Cursor agent
  runtime and declared on the `software-engineer` person via `runtime.kind`.
  Do not fold Cursor into the OpenAI-compatible LLM provider form.
- Treat CLI coding agents as optional adapters, not the core architecture.
- Keep role instructions and requested capabilities declarative.
- Select the sandbox provider explicitly when composing the Sweat server. The
  run executor receives that provider; it does not inspect deployment
  configuration or know the container technology.
- Prepare deterministic inputs through orchestrator entrypoints before an
  agent starts. A role does not decide how to acquire a repository or other
  required context.
- Use MCP for external capabilities. A role requests a capability; a run grants
  a narrowly scoped session.
- Use a provider-maintained SDK for provider integrations when one exists. The
  adapter owns only Sweat-specific scoping and orchestration.
- Configure tenant connections and start runs through the self-hosted product UI.
- Keep the frontend a static client of an explicit server API so browser and
  Tauri clients share the same product boundary.
- The Software engineer hovercard is currently static presentation metadata;
  it can advertise a capability that is not configured for a deployment. Make
  it derive from the server's eligible capability summary when configuration
  visibility is added.
- Keep collaborative runs server-owned so they continue independently of any
  browser tab or desktop process.
- Have the server apply database migrations idempotently and ensure structural
  seed data such as `General` exists at startup. Clients never initialize or
  seed the server database.
- Index room message text with SQLite FTS5 for universal search; the store port
  stays search-by-query, and only the SQLite adapter owns the FTS virtual table
  and sync triggers. See [message search](./message-search.md) and
  [ADR 0010](./adr/0010-sqlite-fts5-message-search.md).

## Current support

- Static Vite/React client using an explicit HTTP/WebSocket server boundary.
- Tauri macOS packaging of the same React client, including first-launch server
  selection and authenticated native HTTP/WebSocket transports.
- Server-owned Better Auth, SQLite persistence (including FTS5 message search),
  and run control.
- Closed workspace admission with one-time administrator setup, username
  login, single-use invitations, and member suspension.
- Apple Container sandbox provider with automatic cleanup.
- Generic Bun agent image and an asynchronous software-engineer run executor.
- Optional Cursor agent runtime image (Node 22.13+, `@cursor/sdk`) for
  `software-engineer` (`runtime.kind: cursor`) via Workspace → Cursor agent
  runtime; `antboy` uses the OpenAI Agents image and Workspace LLM provider.
- OpenAI-compatible model calls, a shell tool, and shell subprocesses without
  model credentials.
- A composable MCP gateway core that issues expiring sessions and filters tools,
  plus a Linear upstream adapter.
- Repository-workspace provisioning and a GitHub adapter backed by Octokit.
- Durable room attachments copied as verified, disposable software-engineer
  run inputs; storage keys remain server-only, and a scoped `view_image` tool
  sends supported raster copies to vision-capable models.
- Universal message search (Cmd/Ctrl+K) over accessible rooms via FTS5-backed
  `GET /api/search/messages`, with jump-to via history `around` loading.
- Issues as the agent-work surface: assigning an agent starts an Issue-linked
  run, child assigns dispatch isolated child runs, and the parent gets an
  integrate run when direct children are In review or Done. See
  [Issue dispatch then integrate](./issue-dispatch-integrate.md).

## MCP target design

```text
Tenant connection -> Linear API key stored by the self-hosted deployment
Run grant         -> allowed tools, resources, and expiry
MCP session       -> short-lived token presented by the agent container
```

The gateway is the agent-facing MCP server. It keeps the Linear key out of
agent containers, proxies approved calls to Linear, audits them, and revokes
the session when a run ends.

## Deliberately not built yet

- Room renaming and room deletion.
- Native OS notifications and tray status.
- Gateway HTTP/MCP transport.
- Run scheduler, capability-grant policy, and resource-level authorization.
- Sub-agent scheduling and shared artifact handoff.
- Sandbox egress allowlisting and a TLS capability endpoint (see
  [sandbox hardening](sandbox-hardening.md)).

## Current delivered slice

Tauri packaging, first-launch server selection, `sweat://` invite deep links,
and a presence-only dock badge (mirroring room sidebar markers) now follow the
delivered Account admission slice. The current multiplayer slice adds durable,
account-directed room attention for teammate mentions and terminal run
handoffs.
