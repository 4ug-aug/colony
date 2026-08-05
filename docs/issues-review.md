# Code review: workspace Issues

Review of the uncommitted Issues feature (2026-08-05). Focus: security and
maintainability. Paths are relative to the repository root.

Scope reviewed:

- new: `project/gui/drizzle/0016_issues.sql`, `project/gui/src/server/issue-store.ts`,
  `project/gui/src/server/issue-runner.ts`, `project/mcp/workspace-issues.ts` (+ their tests)
- modified: `project/gui/src/server/coordinator.ts`, `project/gui/src/server/run-control.ts`,
  `project/agents/grant-context.ts`, `project/agents/roster-people.ts`,
  `project/agents/software-engineer-adapters.ts`, `project/roles/antboy.ts`,
  `project/roles/software-engineer.ts`, `project/gui/src/features/shell/room-sidebar.tsx`

Verification: `bun run typecheck` in `project/gui` is clean and the 7 new tests
pass. The behavioural claims below were confirmed by applying `0016_issues.sql`
to an in-memory database and driving `createSqliteIssueStore` directly, not by
reading alone.

## Verdict

Solid, consistent-with-the-codebase slice — parameterized SQL throughout, auth
enforced before every route (`coordinator.ts:621`), CHECK constraints on the
enums, no secrets in logs. But it copies the schedule feature's shape while
dropping three of its safety mechanisms, and the two write paths (HTTP and MCP)
have drifted apart.

## High

### 1. No single-active-run guard — unbounded agent spawning

Schedules enforce one active run with a DB constraint:

```sql
CREATE UNIQUE INDEX `schedule_one_active_run_idx` ON `schedule_run` (`schedule_id`)
  WHERE `state` IN ('preparing', 'running');
```

(`project/gui/drizzle/0010_schedules.sql:37`), surfaced as a 409 via
`ScheduleActiveRunError`. `0016_issues.sql` has no equivalent, and
`issue-runner.ts:44` does not check either. Three simultaneous `running` runs on
one issue were created successfully. Each `POST /api/issues/:ref/runs` starts a
real sandbox, so any authenticated user can loop that endpoint and exhaust
capacity and spend.

Fix: one line in the migration plus a 409 branch in the route — DB constraint
over app code, same as schedules.

### 2. Issue runs are never recovered after a restart

`coordinator.ts:557-561` calls `options.store.failStaleRuns()` and
`scheduleRunner?.failStaleRuns()` at startup. Issue runs get nothing, so
anything left in `preparing`/`running` when the coordinator dies stays there
forever.

### 3. Description is unbounded and goes straight into an agent prompt

Title is capped at 500 in both the store (`issue-store.ts:309`) and the DB
CHECK; description is capped in neither — a 2 MB description inserted fine.
`buildIssueRunTask` (`issue-store.ts:155`) inlines it verbatim, and the whole
rendered task is then stored per run in `issue_run.task`. Combined with finding
1, that multiplies.

Fix: a length CHECK plus a store guard mirroring the title.

### 4. Stored prompt injection across agents

`workspace.issues` has no `applies` gate
(`project/agents/software-engineer-adapters.ts:48`), so every antboy and
software-engineer run gets create/update/assign on *all* issues. Description
text is spliced into a later run's task with no fencing or provenance marker,
and that run has shell access. An agent — or any user — can plant instructions
in a description that a different agent later executes.

`linear.issues` has the same shape, but its content came from an external
tracker with its own ACL; this is now self-service.

Fix: fence the untrusted fields in `buildIssueRunTask` and label them as data.

## Medium

### 5. Parent cycles are accepted

`issue-store.ts:345` rejects only `patch.parentId === id`. A two-node cycle
(a→b, b→a) was accepted. Nothing traverses recursively today, so it is latent —
but the tree UI this schema exists for will recurse forever on it.

### 6. MCP writes do not broadcast

The adapter port at `coordinator.ts:1709-1762` calls `issueStore` directly,
skipping `broadcastWorkspace`. Identical operations over HTTP do broadcast.
Every issue an agent creates or reassigns is invisible to connected clients
until reload.

Fix: route the port through the same helpers the HTTP handlers use.

### 7. Three validators, three behaviours

`POST /api/issues` silently *drops* invalid `tags`/`timeSpent` entries via
`.filter(...)`; `PATCH` *rejects* them; MCP *rejects* them. Same field, three
contracts.

The status/priority enums are now spelled out in five places: the migration
CHECK, the `issue-store` types, the coordinator's `statuses`/`priorities`
arrays, the `workspace-issues` type guards, and both role files. That is roughly
360 lines of hand-rolled parsing re-deriving what `issue-store` already types.

### 8. Owner ids half-validated

The HTTP paths check agent owners against `agentDefinitions()` but accept any
string as an `account` id; MCP checks neither. A bogus agent id set via MCP
fails only later, at `startRun`.

## Low

- `decodeURIComponent(issueRoute[1]!)` (`coordinator.ts:1050` and four more
  sites) throws `URIError` on `GET /api/issues/%`. There is no try/catch around
  `fetch`, so that is a 500 instead of a 400.
- `issue-store.test.ts:11-48` hand-copies the schema minus every CHECK and the
  owner-pairing constraint, so it cannot catch app/DB drift. Executing the real
  `0016_issues.sql` instead is how the findings above were confirmed.
- No pagination on `listIssues` or `GET /api/issues/:ref/runs`; schedules
  paginate with limit+cursor, and runs carry full stdout/stderr.
- `childProgressFor` binds one parameter per issue — throws past SQLite's
  variable limit.
- `transaction` at `issue-store.ts:129` is a byte-identical copy of
  `schedule-store.ts:151`.
- The four `issue.*` / `issue_run.*` server messages have no client consumer yet.

## Suggested order

Findings 1 and 2 before this ships; both are a few lines each. Then 3 and 4,
which share a fix site in `buildIssueRunTask` and the schema. 6 and 7 are the
maintainability items that get more expensive once the UI lands.
