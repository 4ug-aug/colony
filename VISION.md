# Sweat vision

Sweat is a self-hosted multiplayer workspace where people and AI agents work
together. It should feel less like a dashboard for launching processes and
more like a place where a team delegates work, follows it as it happens, and
keeps the result in context.

## The experience

A workspace contains people, agent definitions, and rooms. A room is a durable
context for a project, feature, incident, customer, or team. People can talk in
the room, ask an agent to do work, watch the resulting run progress, and
continue the discussion when it finishes.

```text
Person assigns work in a room
  -> Sweat creates a bounded run from an agent definition
  -> the run executes in an isolated sandbox
  -> progress and results appear in the room
  -> the room retains the shared record
```

Agents should feel like visible participants in the workspace, with names,
roles, capabilities, and activity. They are not permanent background
processes: an agent definition describes a reusable kind of worker, while each
piece of delegated work remains a bounded, auditable run.

The workspace is broader than software engineering. A team may add engineers,
researchers, support triage, marketing, or company-specific roles, all using
the same run and sandbox mechanisms.

## Product principles

- **Self-hosted and user-owned.** A deployment controls its workspace, data,
  model providers, integrations, and agent execution.
- **Multiplayer by default.** Work belongs to shared rooms rather than a
  single user's local session.
- **Agents are collaborators, runs are bounded.** Agents are visible in the
  product, but execution retains Sweat's isolated run lifecycle.
- **One server, multiple clients.** The server is authoritative for identity,
  rooms, history, runs, grants, and realtime updates.
- **Capabilities stay narrow.** Agents reach external systems through scoped,
  expiring grants; provider credentials remain outside their sandboxes.
- **The shared record matters.** Tasks, progress, results, and human decisions
  remain together so future people and agents can understand what happened.

## Client direction

Sweat's intended primary daily experience is a native Tauri desktop
application, with the browser client kept as a universally accessible
alternative. The frontend must therefore be a static API client, not the place
where product server logic lives.

```text
Browser client ─┐
                ├── HTTPS + realtime connection ──> self-hosted Sweat server
Tauri client ───┘                                      ├── workspace data
                                                       ├── run orchestration
                                                       └── sandbox workers
```

The browser and Tauri applications should share the same React client and use
the same server API. Tauri adds native affordances such as notifications, tray
status, deep links, and safe local integration; it does not contain a second
orchestration implementation.

The self-hosted server must continue running when desktop clients close. Runs
belong to the shared workspace, not to the lifetime of a browser tab or
desktop process.

## Current foundation

The current GUI is split into:

1. a static frontend that depends only on an explicit server API and realtime
   protocol; and
2. a server that owns authentication, persistence, run control, and
   subscriptions.

The current multiplayer slice is one implicit workspace with shared public
rooms. Authenticated people can create and select rooms; **General** remains
seeded. Each room retains its own durable message history and linked run
history. A message with the exact leading mention `@software-engineer `
delegates a bounded run whose progress and result stay in that room and
survive refreshes and server restarts.

The room experience keeps messages left-aligned as a shared team timeline.
An active agent is represented by a small status badge below the request, then
by a normal agent-authored result when it completes. The static client uses an
inset, rounded main surface so the same API client is ready to become the
future Tauri shell without taking server responsibility.

Next, add membership and Tauri packaging on top of this shared public-room
flow.

## Deliberate non-goals

- Do not embed the Sweat server, database, or sandbox workers inside Tauri.
- Do not create separate browser and desktop product backends.
- Do not turn agent definitions into permanent processes merely to make them
  look present; room activity comes from bounded runs.
- Do not adopt federation, peer-to-peer protocols, or a universal event model
  before the workspace requires them.
- Do not add private rooms, room membership, invitations, renaming, or
  deletion in the current public-room slice.
- Do not add Redis, object storage, or multi-node infrastructure until the
  single-node self-hosted product outgrows simpler storage.

Buzz is an inspiration for the product experience—especially agents and
people sharing one workspace—but Sweat keeps its own bounded-run, sandbox, and
capability architecture.
