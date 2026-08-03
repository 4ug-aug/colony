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

**Account mention**: An exact `@username` reference in a room message that
directs another account's attention to that room. Agent identifiers share the
same visible `@` syntax but are not account mentions.
_Avoid_: Notification, assignment

**Attention**: A durable, account-directed reason to return to a room, created
by an account mention or by a terminal run relevant to that account.
Acknowledging attention clears its room badge without changing or deleting the
shared record.
_Avoid_: Unread message, notification

**Schedule**: A workspace-owned recurring delegation that starts bounded runs
at configured times. It references an agent definition and reusable task while
each run resolves the current definition and workspace policy. Its creator is
retained as attribution, while its configuration, run history, and results are
shared outside room conversation.
_Avoid_: Scheduled task, cron job, personal automation

**Schedule run**: A bounded run created from a schedule, either when it becomes
due or when a person chooses **Run now**. It is retained in the schedule's
shared history rather than a room timeline.
_Avoid_: Scheduled run, schedule occurrence, background task

**Workspace membership**: A Sweat server's authorization for an account to
participate in its workspace. Authentication proves control of the account;
membership determines whether that person may enter.
_Avoid_: Login, identity

**Server operator**: The person or organization that runs a Sweat server and
controls its deployment configuration. The operator need not participate in
the workspace.
_Avoid_: Workspace administrator, member

**Dedicated Sweat host**: A machine reserved for operating one Sweat server and
its disposable sandboxes. It is not a shared workstation or a general-purpose
agent execution host.
_Avoid_: Worker pool, shared server

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

**Room attachment**: Durable bytes and metadata attached to one room message.
When that message starts a run, the server verifies and copies the attachment
into that run's disposable `/work/.sweat/attachments/<id>/<filename>` input;
the room original remains outside the sandbox.
_Avoid_: Artifact, workspace file

**Task**: The plain-text assignment supplied by a run to an agent runtime.
_Avoid_: Prompt

**System instructions**: The role-owned instructions supplied by an agent
definition.
_Avoid_: Task prompt

**Model endpoint**: The OpenAI-compatible provider URL selected by the
workspace and resolved into one run's model configuration when that run's
agent runtime kind is `openai-agents`. It may be a hosted service or a model
server operated elsewhere on the customer's network.
_Avoid_: Sandbox provider, agent runtime kind, Cursor runtime

**Agent runtime kind**: Which in-sandbox agent loop a person uses — currently
`cursor` (Cursor local SDK) or `openai-agents` (OpenAI Agents SDK against a
model endpoint). Declared on the agent definition with an explicit container
image; credentials are resolved by composition from workspace settings, never
stored on the definition.
_Avoid_: Sandbox provider, model endpoint, LLM provider (UI label for model endpoint config)

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

An **agent definition** is one person in the workspace (for example
`software-engineer` or `antboy`). It defines that person's system instructions,
requested capabilities, **agent runtime kind**, explicit container image, and
execution limits. It does not hold provider credentials or choose run inputs.

**software-engineer**: The coding person. Runtime kind `cursor`, with GitHub
and repository checkout among its capabilities when granted.
_Avoid_: software-engineer-cursor, Cursor engineer

**antboy**: A non-GitHub collaborator person. Runtime kind `openai-agents`,
with room, task, shell, and attachment access when granted, but no GitHub
capability and no repository clone into `/work`.
_Avoid_: general-purpose agent, assistant

A **run/job** selects an agent definition and supplies its task plus optional
context.

A **sandbox** is a generic, disposable execution environment. It starts in
`/work`, which is empty unless a run deliberately prepares inputs there. It
must not assume a repository or GitHub.

**Sandbox provider**: The explicitly deployment-selected adapter that creates,
executes within, and disposes of a sandbox. It fulfils the same sandbox launch
contract regardless of the container technology underneath.
_Avoid_: Runtime, agent provider, agent runtime kind

## Runtime and models

The agent reasoning loop runs inside the disposable sandbox container. Each
person declares an **agent runtime kind** and an explicit image; composition
injects the matching workspace credentials. Do not duplicate a person merely to
select a different engine. See
[ADR 0008](docs/adr/0008-agent-runtime-kind-on-definition.md).

For `openai-agents`, model configuration remains OpenAI-compatible and
provider-neutral:

```ts
{
  (provider, baseUrl, apiKey, model);
}
```

For `cursor`, the workspace supplies a Cursor API key and model id; inference
stays Cursor-hosted.

The sandbox launch contract is deliberately small: task, agent definition and
instructions, runtime credentials for that kind, an optional scoped MCP session,
and `/work` as its current directory. It does not receive Run IDs, repository or
provider details, or upstream provider credentials. Runtime API keys and the MCP
session token are technical credentials; tool subprocesses must not inherit them.

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

Room attachments stay durable with their messages. Only attachments on the
message that triggered a run are copied, after metadata and checksum
verification, into that run's `.sweat/attachments/<id>/` staging area.
Repository workspaces exclude that staging area from Git. The runtime can pass
supported raster images from this area to a vision-capable model with its
scoped `view_image` tool.

V1 also has no structured run-output or handoff model. The runtime report and
the durable effects of granted capabilities are its handoff. Add structured
outputs only when another run must reliably consume a prior run's result.

## Software-engineer repository runs

A **Git workspace** is the software-engineer role's prepared repository input:
a Git working directory seeded at the resolved base revision. The sandbox may
inspect, edit, test, create local branches, and commit, but receives no Git
provider credential. A GitHub capability adapter accepts only a clean `HEAD`
descended from that base, publishes it under the platform-assigned remote run
branch, and opens its pull request in the scoped repository.

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
