# Structured step stream over container stdout

Status: accepted

To let people watch what an agent is doing and later verify it, a run now
records an ordered **step history** (`message`, `tool_call`, `tool_result`;
see `CONTEXT.md`). The container emits these steps as **newline-delimited JSON
on its process stdout**: `runtime/cli.ts` stops writing raw narration and
writes one JSON line per step, and the final run output becomes a terminal
step. The container's process stdout is fully owned by the runtime (the shell
tool captures its subprocess output separately as a tool result), so it can
carry a clean structured stream. `stderr` still carries raw crashes.

The step protocol lives in the **runtime adapter, not the platform**: the
`sandbox.exec` / `AgentProvider` boundary stays a generic byte stream, and the
`openai-agents-runtime` provider parses stdout lines into typed `Step`s and
surfaces them through an `onStep` callback parallel to `onOutput`. A future
non-Agents-SDK runtime emits the same `Step` shape its own way. Because the
full narration is now the `message` steps, `RunRecord.stdout` no longer holds
the raw stdout dump; instead the provider sets it to the agent's **final
answer** (the last `message` step, i.e. the runtime's `finalOutput`) so a
succeeded run still shows a result message in its room.

## Considered options

- **MCP back-channel** (agent reports steps through the platform MCP gateway):
  rejected — runs without a capability grant have no MCP session at all, so
  step reporting would only work for granted runs, and it conflates capability
  tools with runtime telemetry.
- **A dedicated side channel / extra fd**: rejected for v1 — `exec` only
  surfaces stdout/stderr, and threading arbitrary fds through the Apple
  Container SDK is plumbing without a clear win.
- **A step-aware `AgentProvider` port** (typed steps end-to-end): rejected —
  it bakes the step protocol into the runtime-agnostic core; adapter-owned
  parsing keeps the platform generic.

## Consequences

- `docs/run-lifecycle.md`'s "V1 does not provide a live agent-to-operator
  communication channel" no longer holds: the step stream is exactly such a
  channel (structured, one-directional).
- Steps are durable in a dedicated append-only `run_steps` sqlite table,
  bounded by the execution policy (a `maxSteps` count cap plus per-payload
  truncation, mirroring `maxOutputBytes`; runs may lower, never raise).
- Step visibility inherits the room's existing shared-room trust boundary —
  every member already sees the task and result. No per-user or private-step
  visibility model is added in this slice. Two hard invariants: steps never
  carry technical credentials (model API key, MCP session token), and step
  payloads are bounded and truncated.
- Live delivery adds one realtime message, `run.step` (incremental append);
  `room.snapshot` carries only the latest step per active run, and the full
  history is fetched lazily via `GET /api/rooms/:roomId/runs/:runId/steps`
  when the verification popover opens.
