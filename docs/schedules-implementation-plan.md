# Schedules implementation plan

Implement [Schedules](./schedules-spec.md) as a workspace-level projection over
the existing generic run executor. Keep room messages and `room_run` unchanged;
scheduled work has its own persistence and UI while reusing the sandbox,
runtime, capability-session, step, cancellation, and cleanup paths.

## Constraints

- The authoritative scheduler runs in the Sweat server. Browser and Tauri
  clients only configure and observe schedules.
- This deployment remains single-server and SQLite-backed. Do not add a queue,
  worker service, Redis, or distributed lease.
- Do not turn scheduling into a generic trigger framework.
- Do not route schedule runs through fake or hidden rooms.
- Do not rewrite existing room-run persistence into a universal run schema for
  this slice. Add a schedule-specific projection and share execution code.

## 1. Cron semantics

Add `croner` for five-field validation, timezone-aware next-occurrence
calculation, and preview dates. Add `cronstrue` for the English description.
Both provide TypeScript/browser support; keep one shared pure module so client
preview and server validation cannot drift.

Create `project/gui/src/features/schedules/cron.ts` with one public operation:

```ts
previewCron(expression, timezone, from): {
  description: string
  nextRuns: number[]
}
```

It must reject anything other than exactly five whitespace-separated fields,
invalid expressions, invalid IANA timezones, and expressions with no future
occurrence. Format dates in the UI, not in this module.

Add one focused test covering a valid Copenhagen Friday schedule, invalid
syntax/timezone, and stable next occurrences across the shared helper. Do not
write a cron parser.

References: [Croner](https://www.npmjs.com/package/croner) and
[cRonstrue](https://www.npmjs.com/package/cronstrue).

## 2. Persistence

Add `project/gui/drizzle/0010_schedules.sql` with three tables.

`schedule`:

- `id` primary key
- `name`
- `agent_definition_id`
- `task`
- `cron_expression`
- `timezone`
- `state` checked to `active | paused | archived`
- `created_by` referencing the retained account
- `created_at`
- `updated_at`
- nullable `next_run_at` (`active` only)

`schedule_run`:

- `id` primary key, matching the executor run ID when execution starts
- `schedule_id` referencing `schedule`
- `source` checked to `automatic | manual`
- nullable `scheduled_for` for automatic runs
- nullable `started_by` for manual runs
- snapshotted `task` and `agent_id`
- the same lifecycle/result columns used by `room_run`

Add indexes for active schedules ordered by `next_run_at`, schedule history
ordered by creation time, and a partial unique index allowing at most one
`preparing` or `running` row per schedule.

`schedule_run_step` mirrors the bounded step fields in `run_step` and references
`schedule_run`. Keeping the projection separate avoids weakening `run_step`'s
existing room foreign key or migrating room history.

Create `project/gui/src/server/schedule-store.ts` and a focused store test. The
store owns transactions for:

- create/update/pause/resume/archive/restore;
- creating a manual run only when no active run exists;
- claiming a due automatic run and advancing `next_run_at` to the first cron
  occurrence after `now`;
- retaining a due `next_run_at` while another run is active, which implements
  coalescing after completion;
- projecting run state and steps;
- marking interrupted active runs failed at startup; and
- paginating run history.

Keep timestamps injectable in tests. The database transaction and partial
unique index are the duplicate-work guard; an in-memory boolean is not.

## 3. Make run composition context-aware

`project/gui/src/server/run-control.ts` currently requires `roomId`, and the
software-engineer composition always includes `workspace.room`. Generalize the
start context just enough for both callers:

- room delegation passes `{ roomId }` and optional attachments exactly as now;
- schedule delegation passes `{ scheduleId }` and no attachments;
- both use the same `SoftwareEngineerExecutor` and `RunExecutor` lifecycle.

Give capability adapters a small applicability predicate over grant context.
The room adapter applies only when `roomId` exists. Linear, GitHub, repository,
and other non-room adapters continue to apply to schedule runs. Build the tool
grant and MCP upstream list from the applicable adapters for each run, then
mint the usual short-lived session.

Make the software-engineer instructions conditional on available room tools;
they must not claim every task came from a room. Preserve the current behavior
when room context is present.

Add tests proving that:

- room starts still receive room context, attachments, and room tools;
- schedule starts receive schedule context, omit room tools, and retain
  eligible external capabilities; and
- every start resolves current model/configuration rather than a stored
  schedule snapshot.

Do not introduce a second executor or a schedule-specific sandbox path.

## 4. Schedule runner and clock

Create `project/gui/src/server/schedule-runner.ts` as the boundary between the
schedule store and `RunControl`. It owns:

- `runNow(scheduleId, accountId)`;
- `tick()` for all due schedules;
- projection of matching run changes and steps into `schedule_run` tables;
- cancellation through existing `RunControl.cancel`; and
- conversion of a pre-execution start error into a retained failed schedule
  run.

Make `tick()` and `now` directly callable/injectable. Tests use a fake clock and
fake control; no test waits for a real timer.

At server composition, call `tick()` once after stale runs are marked failed,
then every 15 seconds with `setInterval`. Clear the interval during coordinator
shutdown. Cron stays minute-granular; polling only bounds how late a due run
starts.

For each due schedule, the runner starts through `RunControl`. Its synchronous
`onCreate` callback transactionally inserts the schedule-run projection and
advances the schedule. If a manual request or another tick won the active-run
constraint first, abandon the duplicate before the executor stores or executes
it.

When execution cannot start before `onCreate` (for example, the selected agent
or model is unavailable), transactionally record a failed attempt and advance
an automatic schedule once. Do not leave it due and generate a failure every
15 seconds.

## 5. Server API and realtime events

Add authenticated workspace endpoints, available to every admitted member:

```text
GET    /api/agent-definitions
GET    /api/schedules
POST   /api/schedules
PATCH  /api/schedules/:id
GET    /api/schedules/:id/runs
POST   /api/schedules/:id/runs
POST   /api/schedule-runs/:id/cancel
GET    /api/schedule-runs/:id/steps
```

`POST /api/schedules/:id/runs` implements **Run now**. `PATCH` handles edits
and lifecycle state changes; reject invalid transitions and unknown agents.
Bound names to 50 characters and tasks to the existing 10,000-character
message boundary. Return `409` when an active run blocks **Run now**.

Expose agent-definition summaries containing ID, visible name, description,
and currently eligible capability summaries. This is presentation metadata,
not credentials or grants. The first slice may return only
`software-engineer`; keep the stored schedule ID generic without building a
tenant agent registry.

Broadcast workspace-visible events over the existing workspace stream:

```text
schedule.created
schedule.changed
schedule_run.created
schedule_run.changed
schedule_run.step
```

Do not broadcast them to room streams. A REST snapshot followed by idempotent
event upserts is sufficient; do not add another realtime protocol.

Add coordinator/API tests for authentication, validation, all-member access,
manual start conflicts, lifecycle transitions, no room writes, and realtime
broadcasts.

## 6. Schedules UI

Add `schedules` to `DashboardView` and a workspace-level **Schedules** item in
`room-sidebar.tsx`, visible to every member. Render a new
`features/schedules/schedules-page.tsx` from `dashboard.tsx`.

Build the page from existing UI primitives:

- active/paused list and an Archived filter;
- create/edit form with name, agent card/select, task, cron, and timezone;
- live cron description and next-three-runs preview;
- schedule row/detail with status, creator, next run, latest result, and the
  agreed controls;
- run-history pagination; and
- run detail with live steps, result, failure, and cancellation.

Extract the agent display metadata currently embedded in the sidebar or replace
it with the server's agent-definition summaries so the schedule form and agent
sidebar cannot disagree.

Reuse `RunActivityRail` presentation by making its step loader and attribution
header accept room or schedule runs. Do not fork a second step renderer. A
schedule run header says either `Automatic · scheduled for …` or
`Run now by @username`; it never invents a requester.

Create `use-schedules.ts` for REST loading and idempotent workspace-event
upserts. Opening the page must show durable state after refresh or desktop
restart; no scheduler state belongs in React or Tauri.

## 7. Verification

Leave the smallest runnable checks at each non-trivial boundary:

1. cron preview tests;
2. schedule-store transaction and lifecycle tests;
3. fake-clock runner tests for normal due runs, manual runs, overlap,
   coalescing, restart catch-up, and start failure;
4. capability-composition regression tests;
5. coordinator API/realtime tests; and
6. the existing full project test, typecheck, and GUI build commands.

Manually exercise one end-to-end path with a short cron during development:
create, preview, automatic run, live steps, result, **Run now**, edit, pause,
resume, archive, restore, server restart, and confirmation that no room message
was created.

## Delivery order

Ship one vertical slice in this order:

1. cron helper and persistence;
2. context-aware run composition;
3. runner, clock, and API;
4. realtime page and run detail; and
5. full acceptance pass and documentation updates to `VISION.md` and
   `docs/architecture.md` when the feature is actually delivered.

Skipped for this slice: generic triggers, a queue, distributed scheduling,
personal visibility, quotas, retries, and room delivery. Add them only when a
real workflow exceeds the schedule model in the spec.
