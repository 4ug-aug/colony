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
{ baseUrl, apiKey, model }
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

## Current vertical slice: shared public rooms

The current slice makes one deployment one implicit workspace with a seeded
`General` room plus user-created shared public rooms. Any authenticated user
can create, select, and post in any room's durable timeline. A message
beginning exactly with `@software-engineer ` delegates the remaining text as a
bounded run; the linked status is visible below the human request, and a
successful result appears as a later agent-authored message in the same room.

Target shape:

```text
Static React client -> shared public rooms and room-scoped activity
                    -> durable room-linked runs
                    -> existing isolated run executor
```

Constraints:

- Preserve the static client/server split and current run flow.
- Keep the contract usable by browser and future Tauri clients.
- Keep runs server-owned so client shutdown cannot stop them.
- Keep agent definitions, runs, and sandboxes distinct.
- Do not adopt a universal event-sourcing model merely to render shared
  activity.

Acceptance checks:

- Two signed-in browser sessions receive each other's messages and run-status
  updates only for the selected shared room through the server's realtime
  connection; both discover newly created rooms.
- Refreshing either session retains room messages, linked run state, completed
  agent results, and the selected room; active runs found after restart are
  reported as failed rather than silently left active.
- Only the exact leading `@software-engineer ` mention delegates. Ordinary
  text remains an ordinary message, and a missing delegated task is rejected.
- The client presents a left-aligned room timeline, status badge beneath an
  active delegated request, and an inset sidebar with a padded, rounded main
  surface. It stays a static API client suitable for a future Tauri wrapper.

Do not add private rooms, membership management, invitations, room renaming or
deletion, presence, reactions, attachments, Tauri packaging, or persistent
agent processes in this slice.
