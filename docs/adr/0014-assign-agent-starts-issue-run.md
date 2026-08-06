# Assign agent starts Issue-linked run

Status: accepted

Assigning an **Agent definition** as Issue owner starts an **Issue-linked run**
on that Issue (same when creating with an agent owner), unless the Issue is
under **parent cover** or already has an active run; assigning an **Account**
still sets ownership only. Parent cover: when a child's parent is agent-owned,
child Start run is blocked and assigning an agent to the child does not
auto-start — the parent run carries direct child context in its Task, and
Cursor SDK subagents handle fan-out inside that run; Sweat child-assign as
subagent dispatch is deferred. On run **success**, the platform overwrites the
Issue's **Issue Deliverable** with that run's final output (failed/cancelled do
not). Status rules unchanged from ADR 0013: run start → In progress; completion
never changes status; Done is not moved by run start. Rejected: ownership
cascade to children; assign-Account-means-start-run; auto-Done on success;
updating Deliverable on failed/cancelled runs.
