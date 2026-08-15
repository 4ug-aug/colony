# Child Issue assign dispatches a run; parent integrates later

Status: accepted

Supersedes ADR 0014's **parent cover** rule (assign-an-agent still starts an
Issue-linked run; Account assign still does not).

Issues are the agent-work surface. Assigning an Agent definition as owner
starts that Issue's run even when a parent Issue-linked run is active. Those
child runs are the platform-managed isolated jobs; in-sandbox SDK subagents
are not a stand-in. There is no agent-to-agent channel: related awareness is
the Issue record (status, owner, active run, Deliverable, branch) via
`workspace.issues`.

When every **direct** child is In review or Done, the parent is still
agent-owned and not In review or Done, and the parent has no active run, the
platform starts another Issue-linked run on the parent — an **Issue integrate
run**. Same run shape; its Task includes child Deliverables. The trigger is
that settlement edge (and the parent run ending if children already settled),
not a standing “agent-owned means keep running.” A failed child stays In
progress and idle until someone assigns or Start run; it does not auto-retry
and it blocks integrate. Run success still does not move status; the agent
sets In review or Done when its work is ready.

Rejected: keeping parent cover so Cursor SDK subagents fan out inside one
sandbox; a warm parent coordinator that stays up until children finish;
auto-In-review or auto-Done on run success; a messenger between agents.
