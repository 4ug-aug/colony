# Assign agent starts Issue-linked run

Status: accepted; parent cover superseded by [ADR 0023](0023-issue-dispatch-then-integrate.md)

Assigning an **Agent definition** as Issue owner starts an **Issue-linked run**
on that Issue (same when creating with an agent owner), unless a run is already
active; assigning an **Account** still sets ownership only. On run **success**,
the platform overwrites the Issue's **Issue Deliverable** with that run's final
output (failed/cancelled do not). Status rules unchanged from ADR 0013: run
start → In progress; completion never changes status; Done is not moved by run
start. Rejected: ownership cascade to children; assign-Account-means-start-run;
auto-Done on success; updating Deliverable on failed/cancelled runs. Child
dispatch while a parent run is active, and the later parent integrate run, are
ADR 0023.
