# Sweat context

Sweat is an agent orchestration platform that customers can run in their own
infrastructure. It creates on-demand, isolated agent workers for many roles;
software engineering is one possible role, not the platform's default shape.

## Language

**Sweat server**: A self-hosted deployment authoritative for one workspace,
including its identity, rooms, history, and runs. A client connects to a Sweat
server; it does not own the workspace.
_Avoid_: Backend, instance

**Account**: A person's server-local identity and credentials on one Sweat
server. Accounts do not transfer between Sweat servers.
_Avoid_: Global identity, identity key

**Username**: A workspace-unique handle associated with an account, used for
sign-in and as the person's primary visible name in the workspace.
_Avoid_: Global username, display name

**Display name**: An optional human-readable account profile label shown with
the account's email in secondary profile details. It does not identify message
authors or room members.
_Avoid_: Username, handle

**Workspace membership**: A Sweat server's authorization for an account to
participate in its workspace. Authentication proves control of the account;
membership determines whether that person may enter.
_Avoid_: Login, identity

**Server operator**: The person or organization that runs a Sweat server and
controls its deployment configuration. The operator need not participate in
the workspace.
_Avoid_: Workspace administrator, member

**Workspace administrator**: An account authorized to manage workspace-wide
membership and settings. The first administrator is established through the
server's one-time setup flow.
_Avoid_: Server operator, room owner

**Workspace invitation**: A single-use authorization created by a workspace
administrator that lets one person create an account and join the workspace
before its chosen expiration. It is an unbound bearer credential: possession
authorizes its first successful redemption.
_Avoid_: Room invitation, open registration

**Account suspension**: Revocation of an account's workspace access and active
sessions while retaining its profile and authored history.
_Avoid_: Account deletion, member removal

**Workspace**: The customer-owned collaborative environment containing people,
agent definitions, rooms, and their shared work history.
_Avoid_: Community

**Room**: A durable context in a workspace where people coordinate work and
where related runs and their results remain visible.
_Avoid_: Channel, conversation

**Task**: The plain-text assignment supplied by a run to an agent runtime.
_Avoid_: Prompt

**System instructions**: The role-owned instructions supplied by an agent
definition.
_Avoid_: Task prompt

**Step**: A single recorded event in a run's execution. A run produces an
ordered **step history**. V1 has three step kinds:

- `message` — assistant narration text the agent writes between tool calls
  (what the UI may friendlily call "reasoning"; it is not a provider-specific
  chain-of-thought token stream, which v1 deliberately does not capture).
- `tool_call` — the agent invokes a tool: tool name and arguments.
- `tool_result` — the tool returns: its outcome, i.e. "the resource the
  agent pulled".

A tool invocation is two steps (`tool_call` then `tool_result`), so the live
indicator can show a call the instant it starts and a tool that never returns
still leaves a visible record. The live activity indicator shows the latest
step; the audit view shows the whole history.
_Avoid_: Event (too generic), Trace, Log line

Step visibility inherits the room's existing shared-room trust boundary: every
member already sees the run's task and result, so they also see its steps. This
slice adds no per-user or private-step visibility model. Two hard invariants:
steps never carry technical credentials (the model API key or MCP session
token), and step payloads are bounded and truncated like retained output. See
[ADR 0003](docs/adr/0003-structured-step-stream-over-container-stdout.md).

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

A **sandbox** is a generic, disposable execution environment. It starts in
`/work`, which is empty unless a run deliberately prepares inputs there. It
must not assume a repository or GitHub.

## Runtime and models

The agent reasoning loop runs inside the disposable sandbox container. Use a
generic container entrypoint such as `sweat-agent run /run/job.json`; do not
create role-specific container entrypoints.

The first intended runtime is a Node/TypeScript agent SDK. Model configuration
should remain OpenAI-compatible and provider-neutral:

```ts
{
  (baseUrl, apiKey, model);
}
```

CLI coding agents (such as Codex or Claude Code) are optional runtime adapters,
not the platform architecture.

The sandbox launch contract is deliberately small: task, agent definition and
instructions, model configuration, an optional scoped MCP session, and `/work`
as its current directory. It does not receive Run IDs, repository or provider
details, or upstream provider credentials. The model API key and MCP session
token are technical credentials required by the runtime; tool subprocesses
must not inherit them.

## Roles and capabilities

Roles declare capabilities rather than relying on implicit host state. A
software-engineer role may be allowed shell, Git, and GitHub tools, but a run
prepares required repositories and other inputs before the role starts. Other
roles may use uploaded artifacts, APIs, databases, or only a prompt.

`/work` is a runtime convention, not a repository convention: a run may
prepare a repository, files, or nothing there.

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

Every agent runtime starts in `/work`; entrypoints prepare any filesystem
inputs directly beneath it. `/work` is disposable staging: an agent may hand
work back through a granted capability (for example, a pull request), but
arbitrary files there do not persist after the run. V1 has no generic artifact
or manifest model; add one only when durable storage or multiple named inputs
need it.

V1 also has no structured run-output or handoff model. The runtime report and
the durable effects of granted capabilities are its handoff. Add structured
outputs only when another run must reliably consume a prior run's result.

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
