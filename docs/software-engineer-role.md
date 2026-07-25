# Software-engineer role: validated path

The first validated use of Sweat is a bounded repository change from one Linear
issue to one pull request. It proves the platform's generic run lifecycle;
software-engineer supplies only role instructions and requested capabilities.

## Target flow

```text
Linear issue
  -> create run(agent: software-engineer, task, repository@commit)
  -> resolve connections and narrow grants
  -> prepare repository workspace
  -> start generic runtime in the workspace
  -> inspect, edit, and test
  -> create branch, commit, and PR through the GitHub grant
  -> return run result and revoke session
```

A run is reproducible when its repository input uses a commit SHA. A branch or
tag is permitted for convenience, but the resolved SHA belongs in the run
record and result.

## What success looks like

Given a Linear issue, a GitHub repository, and a pinned revision, an operator
can create one run that:

1. receives the issue and the exact prepared workspace;
2. can inspect, edit, and run the repository's tests;
3. can read only the granted issue and create a pull request only in the
   granted repository;
4. returns the pull-request URL, summary, changed files, test command/result,
   and final revision; and
5. leaves no sandbox, workspace, or live MCP session behind.

The agent never receives a Linear credential, GitHub credential, or container
daemon access.

## Onboarding surface

Connection setup and run creation start as CLI commands so a self-hosted
deployment can validate the path with minimal infrastructure. The end product
will provide a UI for tenant connections, agent definitions, grants, and runs.
The CLI and UI must call the same platform APIs; neither becomes a second
orchestration path.

## Stages

| Stage | Role experience | Generic platform work | Exit check |
| --- | --- | --- | --- |
| 1. Create a bounded run | Receives task text and a prepared workspace. | Persist a run request, invoke deterministic input provisioners, and record the resolved revision. | A repository at a commit SHA mounts at `/work` and is removed after the run. |
| 2. Bind capabilities | Reads one issue; has no provider credentials. | Resolve tenant connections into resource-scoped grants, create/revoke a session, and expose it over the generic MCP transport. | A container can call only the granted Linear tools for the one issue. |
| 3. Engineer in the sandbox | Inspects code, edits files, and runs tests from `/work`. | Apply execution timeout, output limits, and lifecycle/audit events to every run. | A completed or failed run has captured output and always cleans up. |
| 4. Publish the change | Requests one branch/commit/PR for its changed files. | Route the GitHub capability through the same grant/session transport; enforce repository and allowed write actions. | A PR is created in the granted repository and no other repository. |
| 5. Return a usable handoff | Produces a structured result for a human or caller. | Store generic result artifacts and provider links; make run state queryable. | The caller sees summary, tests, revision, PR URL, and failures without reading container logs. |
| 6. Make it dependable | Works across normal failures and retries. | Add idempotency keys, cancellation, retries where safe, and audit retention. | Repeating a request does not create duplicate sandboxes or pull requests. |

## Role boundary

The software-engineer definition should contain instructions and request
capabilities such as `linear.issues` and `github.pull-requests`. It may state
the expected handoff, but it does not choose checkout mechanics, credential
handling, MCP transport, cleanup, retries, or scheduling.

Those are generic run concerns. A future researcher can use an uploaded
artifact instead of `repository`; a support-triage role can receive a ticket
and a different capability grant; both follow the same input -> provision ->
sandbox -> capability session -> result lifecycle.

## Explicit non-goals for the first path

- No scheduler or queue.
- No worktrees or persistent agent state.
- No automatic merge, deployment, or broad repository write access.
- No sub-agents.
- No generic task-management abstraction over Linear and other providers.

The next implementation target is stage 1 plus stage 2's MCP transport. That
makes the existing workspace provisioner and gateway useful in a real,
credential-safe run before adding more autonomy.
