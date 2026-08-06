# Issue-linked runs

Status: superseded by ADR-0014

Starting work on an Issue creates an **Issue-linked run**. Ownership and
running stay separate: the Issue keeps its single owner; the run executes.
When starting a run, if the owner is an Agent definition, that definition is
used; if the owner is an Account, the starter picks which agent runs. V1 builds
the run Task from a fixed platform prompt (id, title, description, plus parent
context when nested); an editable start-time prompt is deferred. Status
workflow is Backlog → Todo → In progress → In review → Done. Run start moves
the Issue to In progress (including from In review); run completion never
changes status; Done is not moved by run start. Start run is available from
the Issue properties rail and from list rows. Rejected: assign-means-start-run;
auto-Done on successful run completion; starting a run reassigns owner to the
agent.
