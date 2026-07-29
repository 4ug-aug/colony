# Sweat handoff

You are continuing work on **Sweat**, a self-hostable agent orchestration
platform. It launches isolated, on-demand agents for many possible roles;
`software-engineer` is one role, not the platform's central abstraction.

Read `CONTEXT.md` and `docs/architecture.md` before changing code. They are
the source of truth for the design decisions below.

## Architecture to preserve

Keep these separate:

```text
Agent definition -> instructions, requested capabilities, runtime/image
Run/job           -> task, inputs, granted capabilities
Sandbox           -> disposable execution environment
```

The agent runtime runs **inside** the sandbox container. Models are
OpenAI-compatible and provider-neutral:

```ts
{
  (baseUrl, apiKey, model);
}
```

Do not make a role-specific container entrypoint. Instead, a run declares
generic inputs and the orchestrator invokes deterministic preparation
entrypoints before the generic runtime starts.

For repository work, that means a generic `repository` input such as:

```ts
{ provider: "github", repository: "acme/product", revision: "main" }
```

The repository checkout provisioner materializes that exact revision in the
run workspace. The software-engineer role receives the prepared workspace; it
does not choose whether or how to clone it. A revision may be a branch, tag,
or commit SHA. Pinning a commit makes the run reproducible.

## Current implementation

The implementation is under `project/` and uses Bun/TypeScript.

- Apple Container SDK wrapper creates disposable sandboxes.
- `runtime/openai-agents.ts` runs the OpenAI Agents SDK inside the container.
- `roles/software-engineer.ts` declares the software-engineer role.
- `agents/software-engineer.ts` defines the agent and wires its sandbox, role,
  and runtime.
- The generic Bun image is built from `project/Dockerfile`.
- The CLI works with any OpenAI-compatible model:

  ```bash
  cd project
  bun run agent:build
  LLM_BASE_URL=https://api.openai.com/v1 \
  LLM_API_KEY=... \
  LLM_MODEL=... \
  bun run agent:software-engineer -- "Investigate this task and report your findings."
  ```

When `LINEAR_MCP_API_KEY` is set, the CLI keeps it on the host, creates a
run-scoped gateway session, and passes only the short-lived session binding to
the container.

Apple Container needs a host-service DNS rule to reach the host gateway. Set
it up once (the rule is removed after a macOS restart):

```bash
sudo container system dns create host.container.internal --localhost 203.0.113.113
```

Use `SWEAT_MCP_HOST` to override the advertised host for another local
forwarding setup.

## Capability model

MCP capabilities must be composed through this boundary:

```text
Tenant connection -> provider credential held by the deployment
Run grant         -> narrow allowed actions/resources/expiry
MCP session       -> short-lived token given to the container
```

The repository has a composable MCP gateway core, HTTP transport, and Linear
upstream adapter. The gateway keeps provider credentials outside the
container, filters calls, and revokes the session when the run ends. Roles
request capabilities; runs grant them. Do not create a generic task
abstraction until multiple providers prove one is needed.

## Current vertical slice: Account admission

The delivered room slice provides `General` plus public and member-restricted
private rooms with durable messages, linked runs, and authorized realtime
activity.

The delivered account slice closes workspace registration and establishes the
server-owned account lifecycle:

```text
fresh server -> one-time first-administrator setup
             -> Better Auth email/username + password session
             -> administrator-created workspace invitation
             -> invited member joins the existing room experience
```

Read [docs/account-admission.md](docs/account-admission.md) for the agreed flow,
acceptance checks, and non-goals. The domain language is in `CONTEXT.md`; the
sourced authentication decision is
[ADR 0005](docs/adr/0005-better-auth-accounts.md).

Preserve the static client/server split, server-owned runs, and the distinct
agent-definition/run/sandbox boundaries.

Tauri packaging with first-launch server selection is delivered (macOS-first).
The desktop app wraps the same React client and runs its HTTP through Tauri's
native cookie jar; the realtime WebSocket authenticates with a short-lived
`/api/realtime-ticket` fetched over that HTTP path. A self-hosted server needs no
HTTPS. See [ADR 0006](docs/adr/0006-tauri-packaging.md) and
`project/gui/README.md`. The next natural slice is the deferred native
affordances (notifications, tray status, deep links).
