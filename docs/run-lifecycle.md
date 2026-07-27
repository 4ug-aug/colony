# Run lifecycle

A run is one bounded execution request. It selects an agent definition,
supplies a task and inputs, receives narrowly scoped capability grants, and
produces a result before all disposable resources are removed.

Starting a run returns its ID immediately. The executor dispatches it
asynchronously in the current process; callers use that ID to inspect state or
request cancellation. This is not a scheduler.

Cancellation is idempotent. Repeated cancellation requests are safe, and a
request for a terminal run is a no-op that returns its current record.

If cancellation is accepted while a run is active, the terminal outcome is
`cancelled` after cleanup, even if the runtime has just finished.

V1 exposes `preparing` and `running` as active states. It has no `queued`
state: a future scheduler or cron trigger decides when to call `startRun`.

A provisioning or session-creation error during `preparing` produces `failed`.
Cancellation accepted during `preparing` produces `cancelled` after partial
resources are cleaned up.

An agent definition sets a maximum duration. A run may request a shorter
timeout, never a longer one; the resolved snapshot records the effective value.
Timeout follows cancellation and cleanup, with terminal state `cancelled`.

Definitions also cap retained stdout/stderr size. A run may lower that limit,
never raise it. The executor retains each stream's tail with a truncation
marker, so the in-memory run store remains bounded and final handoff is kept.

```text
operator / CLI
  -> run
  -> inputs -> provisioner -> /work workspace -> sandbox -> generic runtime
  -> grants -> MCP session -> generic runtime
  -> result
  -> revoke session + remove sandbox + remove workspace
```

## Terms

**Agent definition** describes a reusable kind of worker: instructions,
requested capabilities, runtime/image, and execution policy. It does not hold
provider credentials or choose run inputs.

An agent-definition resolver maps a definition identifier to its definition
snapshot. The CLI or future UI selects an identifier; the executor receives the
resolved snapshot and never branches on role names.

V1 uses an in-memory map-backed resolver. A later tenant-scoped registry can
store user-defined definitions while preserving the same resolver boundary.

A run stores the resolved definition snapshot it executes. Updating an agent's
instructions affects newly created runs only.

**Run** is one use of an agent definition. It records the task, supplied inputs,
resolved grants, lifecycle state, result, and cleanup. It is not a permanent
worker or a scheduler job queue.

V1 task data is one plain-text `task` string. A task is not the role's system
instructions; those belong to the agent-definition snapshot. Structured task
payloads are deferred.

The executor uses a generic run-store port. v1 stores runs in memory; a
file-backed or database-backed implementation can later add durability without
changing the executor's lifecycle semantics.

**Workspace** is a prepared input artifact. `/work` is its path inside the
disposable sandbox. The runtime starts there so an agent can inspect, edit, and
test prepared files; it does not decide how they were acquired.

V1 has zero or one workspace. A provisioner materializes it in a temporary host
directory, then the sandbox provider bind mounts that directory at `/work`.
For example, the GitHub repository provisioner resolves a revision with the
deployment's GitHub App client before extracting files. After the sandbox is
disposed, Sweat removes the host workspace. Credentials are never mounted into
the sandbox.

**Capability session** is the short-lived MCP token and endpoint bound to one
run. The sandbox receives this session, never a Linear, GitHub, or other
provider credential.

**Run result** contains a terminal outcome and runtime stderr, plus the run's
ordered **step history** (see `CONTEXT.md`). The runtime streams steps as
newline-delimited JSON on the container's stdout; the Agents runtime therefore
no longer populates `RunRecord.stdout`, and the `message` steps are its
narration record. Steps are the live agent-to-operator channel and the audit
trail; see [ADR 0003](adr/0003-structured-step-stream-over-container-stdout.md).
V1 still does not collect artifacts.

Capability grants are resolved before execution by a separate composition or
policy layer. The executor receives those resolved grants and only binds and
revokes their sessions; it does not make authorization decisions.

A capability-session factory creates the MCP URL, token, and revocation
operation for those grants. The executor passes that binding to the runtime and
never handles provider credentials or gateway transport details.

Runs without grants have no capability-session binding at all: the runtime sees
no MCP URL or token, and cleanup has no session to revoke.

## Repository input

```ts
{
  type: "repository",
  provider: "github",
  repository: "4ug-aug/sweat-v2",
  revision: "main"
}
```

`revision` accepts a branch, tag, or commit SHA. The provisioner resolves a
branch or tag to a commit SHA before execution, and the resolved SHA is stored
with the run and result. A SHA makes a run reproducible:

```ts
revision: "256041c49af014f1d6f3ec1314a73c4935e3ce80"
```

## Cleanup invariant

Every terminal run state revokes its MCP session and removes its sandbox and
prepared workspace, whether the runtime succeeds, fails, times out, or is
cancelled.

A runtime completion is not enough for `succeeded`: cleanup is part of run
success. Failure to revoke a session or remove disposable resources makes the
run `failed`.

The terminal outcomes are `succeeded`, `failed`, and `cancelled`. Cancellation
is requested by the platform, then implemented through the sandbox provider;
it is never an agent tool.
