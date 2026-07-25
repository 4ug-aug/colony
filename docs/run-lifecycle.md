# Run lifecycle

A run is one bounded execution request. It selects an agent definition,
supplies a task and inputs, receives narrowly scoped capability grants, and
produces a result before all disposable resources are removed.

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

A run stores the resolved definition snapshot it executes. Updating an agent's
instructions or operator tuning affects newly created runs only.

**Run** is one use of an agent definition. It records the task, supplied inputs,
resolved grants, lifecycle state, result, and cleanup. It is not a permanent
worker or a scheduler job queue.

The executor uses a generic run-store port. v1 stores runs in memory; a
file-backed or database-backed implementation can later add durability without
changing the executor's lifecycle semantics.

**Workspace** is a prepared input artifact. `/work` is its path inside the
disposable sandbox. The runtime starts there so an agent can inspect, edit, and
test prepared files; it does not decide how they were acquired.

**Capability session** is the short-lived MCP token and endpoint bound to one
run. The sandbox receives this session, never a Linear, GitHub, or other
provider credential.

**Run result** contains a terminal outcome, runtime output, and named artifacts
collected from the sandbox. V1 has no live agent-to-operator communication
channel; that is a later, separate capability.

Capability grants are resolved before execution by a separate composition or
policy layer. The executor receives those resolved grants and only binds and
revokes their sessions; it does not make authorization decisions.

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

The terminal outcomes are `succeeded`, `failed`, and `cancelled`. Cancellation
is requested by the platform, then implemented through the sandbox provider;
it is never an agent tool.
