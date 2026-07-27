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

## First multiplayer boundary

One deployment currently acts as one implicit workspace. The server seeds a
single `General` room and authorizes every authenticated user to read and post
there. It persists room messages and room-linked run projections, then
broadcasts snapshots and subsequent message/run changes over the realtime
connection.

```text
authenticated user -> durable General message
                   -> @software-engineer task (only at exact leading mention)
                   -> bounded existing run executor
                   -> durable status/result projected back into General
```

The static React client renders this as a left-aligned channel timeline. A
request that delegates work retains a small attached agent-status badge; a
successful result becomes a later agent-authored message. Its inset sidebar
layout leaves a rounded, padded main surface and remains suitable for the
future Tauri shell. The client does not own room state or execution.

## Decisions

- Use a generic in-container Node/Bun runtime, backed by the OpenAI Agents SDK.
- Keep model configuration provider-neutral: `{ baseUrl, apiKey, model }`.
- Treat CLI coding agents as optional adapters, not the core architecture.
- Keep role instructions and requested capabilities declarative.
- Prepare deterministic inputs through orchestrator entrypoints before an
  agent starts. A role does not decide how to acquire a repository or other
  required context.
- Use MCP for external capabilities. A role requests a capability; a run grants
  a narrowly scoped session.
- Use a provider-maintained SDK for provider integrations when one exists. The
  adapter owns only Sweat-specific scoping and orchestration.
- Start connection setup and run creation with a CLI. The self-hosted product
  will provide a UI for tenant connection setup, agent definitions, grants,
  and runs; both surfaces use the same platform APIs and configuration model.
- Keep the frontend a static client of an explicit server API so browser and
  Tauri clients share the same product boundary.
- Keep collaborative runs server-owned so they continue independently of any
  browser tab or desktop process.

## Current support

- Static Vite/React client using an explicit HTTP/WebSocket server boundary.
- Server-owned Better Auth, SQLite persistence, and run control.
- Apple Container sandbox provider with automatic cleanup.
- Generic Bun agent image and an asynchronous software-engineer run executor.
- OpenAI-compatible model calls, a shell tool, and shell subprocesses without
  model credentials.
- A composable MCP gateway core that issues expiring sessions and filters tools,
  plus a Linear upstream adapter.
- Repository-workspace provisioning and a GitHub adapter backed by Octokit.

## MCP target design

```text
Tenant connection -> Linear API key stored by the self-hosted deployment
Run grant         -> allowed tools, resources, and expiry
MCP session       -> short-lived token presented by the agent container
```

The gateway is the agent-facing MCP server. It keeps the Linear key out of
agent containers, proxies approved calls to Linear, audits them, and revokes
the session when a run ends. Capability-session binding is optional per run;
the software-engineer CLI enables it when `LINEAR_MCP_API_KEY` is configured.

## Deliberately not built yet

- Multiple rooms, workspace membership, invitations, and room policy.
- Tauri packaging and native desktop affordances.
- Gateway HTTP/MCP transport and local encrypted connection storage.
- Run scheduler, capability-grant policy, and resource-level authorization.
- Sub-agent scheduling and shared artifact handoff.

## Current delivered slice

The General-room slice provides one shared, seeded room for authenticated
users, with durable messages and room-linked run history. The next product
work can add multiple rooms, membership policy, and Tauri packaging on this
server-backed boundary.
