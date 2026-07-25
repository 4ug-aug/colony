# Architecture

Sweat is a self-hostable platform for running isolated, on-demand agent
workers. A software engineer is one role, not a special platform mode.

## Model

```text
Agent definition  -> instructions, requested capabilities, runtime/image
Run/job            -> task, prepared inputs, granted capabilities
Sandbox            -> disposable execution environment
```

The runtime runs inside the sandbox. The host only creates, configures, and
removes the sandbox.

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

## Current support

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
the session when a run ends. Capability-session binding is the next execution
slice; V1 runs without grants or MCP sessions.

## Deliberately not built yet

- Gateway HTTP/MCP transport and local encrypted connection storage.
- Run scheduler, capability-grant policy, and resource-level authorization.
- Sub-agent scheduling and shared artifact handoff.
