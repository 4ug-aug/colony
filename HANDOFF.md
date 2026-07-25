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
- `composition/software-engineer.ts` composes sandbox, role, and runtime.
- The generic Bun image is built from `project/Dockerfile`.
- The CLI works with any OpenAI-compatible model:

  ```bash
  cd project
  bun run agent:build
  LLM_BASE_URL=https://api.openai.com/v1 \
  LLM_API_KEY=... \
  LLM_MODEL=... \
  LINEAR_MCP_API_KEY=... \
  bun run agent:software-engineer -- "Investigate this task and report your findings."
  ```

The current direct `LINEAR_MCP_API_KEY` binding is deliberately a temporary
end-to-end proof. Do not extend the pattern to provider credentials in agents.

## Capability model

MCP capabilities must be composed through this boundary:

```text
Tenant connection -> provider credential held by the deployment
Run grant         -> narrow allowed actions/resources/expiry
MCP session       -> short-lived token given to the container
```

The repository already has a composable MCP gateway core and Linear upstream
adapter. The eventual HTTP/MCP gateway will keep provider credentials outside
the container, filter/audit calls, and revoke the session when the run ends.
Roles request capabilities; runs grant them. Do not create a generic task
abstraction until multiple providers prove one is needed.

## Next vertical slice

Build the generic repository-workspace input and checkout provisioner, then a
scoped GitHub capability that can create a branch and pull request.

Target flow:

```text
Linear issue -> run created with repository + revision input
             -> checkout provisioner prepares workspace
             -> sandbox starts generic runtime in that workspace
             -> agent edits/tests code
             -> granted GitHub capability creates branch/commit/PR
```

Constraints:

- Keep checkout as a generic input/entrypoint, not a software-engineer special
  case and not an agent shell action.
- Keep GitHub authority scoped to the repository and run, preferably via the
  same gateway/grant/session shape as Linear.
- Never expose GitHub or other provider credentials to shell subprocesses.
- Start with the smallest vertical slice; avoid a scheduler, worktree system,
  OAuth callback flow, or broad provider abstraction unless required.
- Preserve existing tests and add the smallest focused tests for new behavior.

Before implementing a real GitHub integration, verify the current official
GitHub API/MCP documentation. Prefer GitHub App credentials for a deployed
product; an API token can be an explicitly temporary local proof if needed.
