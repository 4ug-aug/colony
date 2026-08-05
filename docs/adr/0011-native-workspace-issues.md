# Native workspace Issues

Status: accepted

Sweat owns a first-party **Issue** work tracker in the workspace. Issues are
workspace-wide (not room-scoped), may nest as parent/child, have a single
owner (Account or Agent definition), and carry title, description, status,
priority, tags, and time spent. Display ids look like `SWE-123`. This replaces
Linear as the software-engineer work-item path so agents and humans share one
native tracker; Asana stays an optional external capability when configured.
The primary human surfaces are a **top-level Issues** sidebar entry showing a
Linear-style **list grouped by status**, and a **dedicated Issue view** (full
page, not a side sheet) with title and description in the main column and a
properties rail for status, priority, owner, tags, time spent, and linked runs.
The rail shows **parent Issue** only when one exists (otherwise omit that
block). **Start run** is available from the properties rail and from each list
row. Display ids always use the fixed `SWE` prefix. List rows show priority,
id, status, title, tags, child progress when nested children exist, owner,
**created** date, and start-run. Rejected: UI-over-external-Linear only; a
separate Objective/Epic/Project type (parent Issue covers grouping);
room-scoped Issues as the primary home; dashboard-only Issues for v1; kanban
columns as the v1 primary view; per-workspace id prefixes; list-only v1
without a detail view; always showing an empty parent/project slot.
