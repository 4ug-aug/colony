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

The Tauri application packages that React interface in the application bundle;
it does not load its interface from the selected server. The server remains
authoritative for identity, database initialization and persistence, rooms,
history, runs, and realtime updates.

On initial startup, the Tauri client asks the person to choose a Sweat server
and remembers that choice. It connects to one server at a time; changing server
replaces the current selection rather than introducing a multi-server
workspace switcher. Desktop clients accept only HTTPS server URLs. A
self-hosted server may use a locally issued or self-signed certificate, but
trust in that certificate must be explicit and scoped; the client must never
disable TLS verification globally. The initial desktop slice relies on the
operating system trust store and explains certificate failures so the person
can trust the server certificate or its issuing CA before retrying. The person
can replace the selected server from the sign-in screen or account menu; doing
so clears server-specific client state and reconnects instead of retaining a
list of servers.

The self-hosted server must continue running when desktop clients close. Runs
belong to the shared workspace, not to the lifetime of a browser tab or
desktop process. In the initial desktop slice, closing the window exits the
client. Reopening it restores durable room and run state; keeping Sweat alive
in the system tray is a later native affordance. Native notifications are also
outside this slice. The first packaged client targets macOS only; other desktop
platforms follow after this boundary is proven. Its deliverable is a locally
buildable unsigned application package; signing, notarization, and release
automation begin when Sweat is distributed to external testers.

## Identity direction

Each Sweat server owns its accounts and sessions through Better Auth's built-in
email-and-password authentication. Accounts do not transfer between servers.
The username plugin adds a workspace-unique username so a person can sign in
with either username or email. The username is the person's primary visible
name throughout the workspace; a hovercard may show the account's display name
and email as secondary profile details. Usernames cannot be changed in the
Account admission slice.

Deployed Sweat servers disable open registration. The operator bootstraps the
workspace by retrieving a random one-time setup token from the fresh server's
startup output. The first visitor who presents that token chooses their email,
username, display name, and password and becomes the first workspace
administrator. The server stores only the token's hash, retains it across
restarts without automatic expiry, and prints the plaintext only when creating
or rotating it. While no account exists, the operator may rotate a lost token
through a server-side command. The setup flow closes permanently after the
first administrator is created.

Later accounts require a single-use workspace invitation created by an
administrator and shared manually. The invited person chooses their own
account details; the administrator chooses a one-, three-, or seven-day
lifetime, with three days selected by default. Administrators can revoke
unused invitations; the workspace retains redeemed, expired, and revoked
invitation states. The initial slice does not send invitation email.
Development may continue to seed reusable local accounts.

Workspace invitations are unbound bearer links. Whoever possesses a valid link
may redeem it first, so the interface warns administrators to share links
privately; Sweat does not imply email ownership without email verification.

The first account remains the sole workspace administrator in this slice.
Promoting or demoting additional administrators is deferred.

If that administrator loses their password, the server operator uses a
server-side recovery command that sets a new password and revokes the account's
existing sessions. Automated reset email and permanent recovery links are
outside this slice.

Signed-in members can change their own password through Better Auth and revoke
their other sessions. Changing account email is outside this slice.

The administrator can suspend and restore member accounts through Better
Auth's admin support. Suspension revokes sessions and blocks sign-in while
retaining room messages, run attribution, and shared history. Account deletion
is outside this slice.

Workspace-wide Members and Invitations live under Workspace settings reached
from the account menu. They remain separate from the membership controls of an
individual private room.

Sweat deliberately does not own a custom cryptographic authentication
protocol. Portable-key identity may be revisited as a separate experiment, but
it is not part of the desktop slice.

## Current foundation

The current GUI is split into:

1. a static frontend that depends only on an explicit server API and realtime
   protocol; and
2. a server that owns authentication, persistence, run control, and
   subscriptions.

The current multiplayer slice is one implicit workspace with public and private
rooms. Authenticated people can create and select rooms; **General** remains
seeded. Private rooms restrict discovery, history, runs, and realtime updates
to their members, who can manage membership within the room's policy. Each
room retains its own durable message history and linked run history. A message
that mentions `@software-engineer` delegates a bounded run whose progress and
result stay in that room and survive refreshes and server restarts.

The room experience keeps messages left-aligned as a shared team timeline.
An active agent is represented by a small status badge below the request, then
by a normal agent-authored result when it completes. The static client uses an
inset, rounded main surface so the same API client is ready to become the
future Tauri shell without taking server responsibility.

The server now initializes its database, admits one first administrator,
supports email or username login, closes open registration, and lets that
administrator manage manually shared invitations and account suspension.

The same React interface is now packaged in Tauri for macOS with first-launch
server selection, native HTTP session handling, and authenticated realtime
connections to the selected Sweat server.

The current vertical slice adds a team attention loop: people can mention
teammates in rooms, directed attention remains visible across sessions, and
requesters plus mentioned teammates are brought back when delegated runs
finish.

## Deliberate non-goals

- Do not embed the Sweat server, database, or sandbox workers inside Tauri.
- Do not create separate browser and desktop product backends.
- Do not turn agent definitions into permanent processes merely to make them
  look present; room activity comes from bounded runs.
- Do not adopt federation, peer-to-peer protocols, or a universal event model
  before the workspace requires them.
- Do not add room renaming or deletion merely as part of account admission or
  Tauri packaging.
- Do not add Redis, object storage, or multi-node infrastructure until the
  single-node self-hosted product outgrows simpler storage.

Buzz is an inspiration for the product experience—especially agents and
people sharing one workspace—but Sweat keeps its own bounded-run, sandbox, and
capability architecture.
