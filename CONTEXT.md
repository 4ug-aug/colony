# Sweat context

Sweat is an agent orchestration platform that customers can run in their own
infrastructure. It creates on-demand, isolated agent workers for many roles;
software engineering is one possible role, not the platform's default shape.

## Language

**Task**: The plain-text assignment supplied by a run to an agent runtime.
_Avoid_: Prompt

**System instructions**: The role-owned instructions supplied by an agent
definition.
_Avoid_: Task prompt

## Core boundaries

Keep these three concepts separate:

```text
Agent definition  -> what kind of worker is this?
Run/job            -> what should it do now?
Sandbox            -> where does it execute?
```

An **agent definition** names a role (for example `software-engineer`,
`researcher`, or `support-triage`) and defines its instructions, model
configuration, allowed tools/capabilities, image, and execution limits.

A **run/job** selects an agent definition and supplies its task plus optional
context.

A **sandbox** is a generic, disposable execution environment. It starts with
an empty filesystem unless a run deliberately supplies an input artifact. It
must not assume a repository, GitHub, or a mounted worktree.

## Runtime and models

The agent reasoning loop runs inside the disposable sandbox container. Use a
generic container entrypoint such as `sweat-agent run /run/job.json`; do not
create role-specific container entrypoints.

The first intended runtime is a Node/TypeScript agent SDK. Model configuration
should remain OpenAI-compatible and provider-neutral:

```ts
{ baseUrl, apiKey, model }
```

CLI coding agents (such as Codex or Claude Code) are optional runtime adapters,
not the platform architecture.

## Roles and capabilities

Roles declare capabilities rather than relying on implicit host state. A
software-engineer role may be allowed shell, Git, and GitHub tools, but a run
prepares required repositories and other inputs before the role starts. Other
roles may use uploaded artifacts, APIs, databases, or only a prompt.

Mounts are optional generic input artifacts, never a required worktree
convention.

## Run inputs and entrypoints

Agents should not be responsible for acquiring their own required context. A
run declares **inputs** (the data or workspace the role needs) and optional
deterministic **entrypoints** (platform-managed preparation steps).

For example, a software-engineer run can request a repository and revision;
the platform's checkout entrypoint acquires it before the agent starts. The
agent receives the resulting workspace and task, rather than deciding whether
or how to clone a repository. Other roles may receive an uploaded artifact,
database query result, or no input at all.

Entrypoints are invoked by the orchestrator, not exposed as agent tools. They
are parameterized, auditable, and must complete before the role runtime starts.

## Software-engineer repository runs

A **Git workspace** is the software-engineer role's prepared repository input:
a Git working directory seeded at the resolved base revision on a
platform-assigned run branch. The sandbox may inspect, edit, test, and commit
that branch, but receives no Git provider credential. A GitHub capability
adapter scoped to the run's repository may publish only that run branch and
open its pull request.

## Sub-agents

SDK handoffs can delegate work within an agent runtime. True isolated
sub-agents are platform-managed jobs: a parent requests a named agent
definition with a task and budget, and the orchestrator validates and schedules
the new sandbox. An agent must not receive raw container-daemon access.

The platform controls budgets, allowed roles, nesting depth, credentials, and
network policy. Tool subprocesses must not inherit model API credentials.

## MCP capabilities

MCP access is a platform service, not bespoke container setup. Every agent
container uses the same generic runtime and connects to one platform-managed
MCP gateway.

Keep these separate:

```text
Connection       -> tenant-owned integration setup (for example, Linear OAuth)
Capability grant -> run-scoped allowed actions and resource scope
MCP session      -> short-lived technical access created from the grant
```

An agent definition requests a capability (for example `linear.issues`), but
does not receive authority merely by requesting it. When a run is created, the
platform resolves tenant policy, task context, and role permissions into a
narrow, expiring grant such as reading and commenting on one Linear issue.

At container spawn, the orchestrator creates an MCP session from that grant and
provides the generic runtime with the gateway endpoint and a short-lived run
credential. Provider credentials remain in the platform gateway, never in the
agent container. Revoke the MCP session when the run completes, expires, or the
container is removed.

The initial tools should remain provider-specific (for example, Linear issue
tools). Add a cross-provider task-management abstraction only when multiple
providers create a demonstrated shared need.

A run binds its granted MCP session to the generic runtime. The runtime
connects to the gateway and exposes only the tools in that session; roles
request capabilities but never receive a provider endpoint or credential.

An agent that can execute arbitrary shell code effectively has its run's
granted capabilities. Mitigate this with narrow grants, short expirations,
auditing, and network egress policy; do not rely on hiding a tool credential
from shell subprocesses. Consequential writes require no per-call operator
approval once the platform has issued the run's narrow grant.
