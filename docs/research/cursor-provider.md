# Cursor as a Sweat agent runtime

Status: implemented as an optional agent-runtime path. See also
[workspace LLM configuration](../workspace-llm-configuration.md) (OpenAI-compatible
only) and the Cursor settings section in Workspace settings.

## Recommendation

Add Cursor later as an optional **agent-runtime adapter** backed by the local
[`@cursor/sdk`](https://cursor.com/docs/sdk/typescript), running *inside the
existing Sweat sandbox*. Do **not** add Cursor to Workspace → LLM provider or
try to use it through the existing OpenAI-compatible model configuration.

Cursor documents the SDK as an agent SDK, not a raw inference/chat-completions
API. Its local mode runs the agent loop against a supplied working directory;
all model inference remains Cursor-hosted. This matches Sweat's existing
`AgentProvider` boundary ([`RuntimeRequest`](../../project/runs/index.ts#L103-L113))
and prepared `/work` workspace, but not its `{ provider, baseUrl, apiKey,
model }` model-endpoint contract ([architecture](../architecture.md#L64-L79)).

Use Cursor's Cloud Agents API only if Sweat deliberately offers a separate
"Cursor-hosted run" product. It would give Cursor the repository clone,
execution VM, GitHub branch/PR flow, and run lifecycle, conflicting with
Sweat's self-hosted sandbox, platform-managed checkout, scoped GitHub adapter,
and MCP gateway. Cursor's cloud API does support durable agents, run-scoped
SSE, cancellation, and optional Cursor-hosted or self-hosted workers, but
those are a different execution architecture.

Sources: [Cursor TypeScript SDK](https://cursor.com/docs/sdk/typescript),
[Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints).

## Fit with the current codebase

| Sweat boundary | Cursor local SDK fit | Decision |
| --- | --- | --- |
| Disposable sandbox + prepared `/work` | `Agent.create({ local: { cwd } })` runs against the supplied directory. | Pass the existing `/work`; do not let Cursor clone a repository. |
| `AgentProvider.run()` | `agent.send()` returns a run that streams assistant text, tool lifecycle, status, and final result. | Implement one `cursor-sdk-runtime` adapter beside [`openai-agents-runtime`](../../project/providers/openai-agents-runtime.ts#L12-L77). |
| Sweat steps | Cursor's stable event envelope has `type`, `call_id`, `name`, and status; tool argument/result payloads are explicitly unstable. | Map assistant text to `message`; map tool start/completion to `tool_call`/`tool_result`; stringify and bound unknown payloads; never retain `thinking`. |
| Scoped MCP | The SDK accepts inline MCP definitions. Sweat enables `settingSources: ["project"]` so workspace-staged and repo `.cursor` skills load; inline MCP remains the Sweat gateway session. | Pass Sweat's short-lived gateway session inline; project settings intentionally load skills/rules from `/work`. |
| Cancellation | Cursor local runs expose `run.cancel()`, while the existing executor disposes the sandbox on cancellation. | Keep sandbox disposal as the hard stop for the first slice; add explicit SDK cancellation only if tests show it is needed for prompt termination. |

Cursor's [stream contract](https://cursor.com/docs/sdk/typescript#stream-events)
is close to Sweat's three public step kinds, but it includes thinking output.
Sweat deliberately does not capture provider chain-of-thought, so that event
must be discarded. Cursor also says tool names and `args`/`result` shapes may
change; the adapter must rely only on the stable envelope and tolerate
truncation.

## Smallest viable slice

1. Create one deployment-side Cursor runtime configuration: encrypted Cursor
   API key plus a selected model ID. Keep it distinct from `ModelRuntimeConfig`;
   the key selects Cursor's agent service rather than an OpenAI-compatible
   endpoint. Cursor's documented public authentication is a user or service
   account API key, not an OAuth connection flow. Use `Cursor.models.list()` at
   configuration validation/startup to discover models instead of hard-coding
   one. [Cursor API authentication](https://cursor.com/docs/api#authentication)
2. Ship a dedicated Cursor agent image with Node **22.13+** and
   `@cursor/sdk`. The current [`Dockerfile`](../../project/Dockerfile#L1-L15)
   is Bun-based; Cursor documents the SDK as Node-first and requires that Node
   version.
3. In that image, create a local agent with `cwd: "/work"`, an explicit model,
   only the run's inline MCP gateway, and `apiKey` passed directly to the SDK
   (not as `CURSOR_API_KEY`). Send the role instructions and task, stream
   normalized public steps, then use `run.wait().result` as Sweat's final
   handoff.
4. Add one adapter contract test: it must prove final-result mapping, tool
   start/result pairing, ignored thinking output, output bounds, and that a
   shell tool cannot read the Cursor key. The last assertion is a required
   trust-boundary check, not optional polish.

Cursor local SDK runs have no interactive approval in headless use and default
to unrestricted tool calls. Sweat's outer container must therefore remain the
security boundary. Do not initially enable Cursor's nested local sandbox;
validate it separately against both Apple Container and Docker. If it is later
enabled, Cursor documents writes restricted to `cwd` and network denied by
default, which may need explicit allowlisting for Cursor and the Sweat MCP
gateway. [SDK sandbox options](https://cursor.com/docs/sdk/typescript#sandbox-options)

For a multi-user deployment, use a Cursor **service-account API key** where
available: Cursor documents that such keys bill the owning team, while user
keys bill the individual user. Keep the Cursor credential server-side and do
not expose it to the web or Tauri clients. [SDK authentication and billing](https://cursor.com/docs/sdk/typescript#authentication)

## Rejected first implementations

- **Custom OpenAI-compatible base URL:** Cursor documents an agent SDK/Cloud
  Agents API, not an OpenAI-compatible inference endpoint. It would mislabel a
  runtime integration as a model endpoint.
- **Cursor CLI adapter:** its headless NDJSON is workable, but the CLI is beta
  and offers less typed lifecycle/control than the maintained SDK. Consider it
  only as a throwaway proof that the agent image can authenticate and reach
  Cursor. [CLI headless mode](https://cursor.com/docs/cli/headless)
- **Cursor cloud as the default:** it duplicates the self-hosted sandbox and
  replaces Sweat's repository/GitHub/MCP authority model with Cursor's. Adopt
  it only as an explicitly separately configured remote-execution option.
  Cursor Cloud Agents auto-run terminal commands, retain cloud-run data, and
  have internet access by default, even though egress controls are available.
  [Cloud security and network controls](https://cursor.com/docs/cloud-agent/security-network)

## Open questions to resolve before implementation

1. Can a direct `apiKey` SDK option be observed by a Cursor shell subprocess?
   Cursor documents that local agents inherit their process environment; run a
   hostile-environment integration test before treating the adapter as safe.
   **Resolved for v1:** the container CLI reads `SWEAT_CURSOR_API_KEY`, deletes
   it (and `CURSOR_API_KEY`) from `process.env` before `Agent.create`, and the
   contract suite asserts shell/`env` tool output cannot observe the key.
2. Does Cursor's nested local sandbox work inside both supported Sweat
   container providers without blocking the Cursor API or MCP gateway?
   **Deferred:** nested `sandboxOptions` stays off; Sweat's outer sandbox is
   the security boundary.
3. Does the Cursor service-account/key and plan selected by an operator permit
   the intended models and concurrent run volume? The SDK says its model catalog
   is account/team-specific, so validate that catalog rather than promising a
   fixed model name.
   **Resolved for v1:** save validates the model id against
   `Cursor.models.list({ apiKey })`.

## Operator path (implemented)

- Configure **Workspace → Cursor agent runtime** (API key + model). Distinct
  from LLM provider settings.
- Use `@software-engineer` (Cursor runtime + repository) or `@antboy`
  (OpenAI Agents + Workspace LLM, no GitHub checkout) in a room or schedule.
- Set `SWEAT_CURSOR_AGENT_IMAGE` to the Node 22.13+ Cursor agent image
  (`sweat-agent-cursor` / `ghcr.io/...-agent-cursor`).
