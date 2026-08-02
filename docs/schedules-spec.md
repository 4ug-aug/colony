# Schedules

Schedules let a workspace delegate recurring work to an agent without adding
automation noise to room conversation. A schedule and every run it creates are
workspace-shared and live on a dedicated **Schedules** page.

## Product model

A schedule contains:

- a name;
- an agent-definition identifier;
- reusable task text;
- a standard five-field cron expression;
- an explicit IANA timezone;
- its creator as attribution;
- `active`, `paused`, or `archived` state; and
- the next automatic run time.

The workspace owns the schedule. Suspending its creator does not pause or
remove it. Every workspace member can view, create, edit, pause, resume,
archive, restore, run, and cancel schedules in this slice.

A schedule references an agent definition rather than copying it. Each run
resolves the current definition, model configuration, inputs, execution limits,
and capability policy. Credentials and capability grants are never stored on
the schedule. A run keeps the effective snapshots with which it was created;
later schedule or agent edits affect only future runs.

## Schedules page

Schedules is a workspace-level navigation destination, not a room tab. It has:

- an active list containing active and paused schedules;
- an archived view;
- create and edit forms;
- each schedule's agent, status, cron preview, timezone, next run, creator, and
  latest outcome;
- controls for **Run now**, pause/resume, edit, archive, and restore; and
- expandable run history with live activity, cancellation, terminal state, and
  result.

The selected agent is always prominent in the form and schedule detail. Before
saving, the form also shows the capabilities that agent may receive under the
current workspace policy. The task and every run's steps and result are visible
to every workspace member.

Schedule runs never create room messages, room results, room attention, or
room-history entries.

## Cron input and preview

Cron uses exactly five fields in this order:

```text
minute hour day-of-month month day-of-week
```

Seconds and cron macros such as `@daily` are outside this slice. The server is
authoritative for validation. The client uses the same parser for immediate
feedback, but the server validates again before saving.

Each schedule stores a named timezone such as `Europe/Copenhagen`, defaulted
from the creator's client. The timezone does not change with the viewer.

The form must show a human-readable description and the next three localized
run times before it can be saved. For example:

```text
0 9 * * 5
Every Friday at 09:00
Next: Fri 7 Aug, 09:00 CEST · Fri 14 Aug, 09:00 CEST · Fri 21 Aug, 09:00 CEST
```

The parser's timezone and daylight-saving behavior is the product behavior;
Sweat does not maintain a second calendar implementation.

## Starting runs

An active schedule starts an automatic run when its stored next-run time is
due. **Run now** starts an additional manual run without changing that time or
the recurring cadence.

Only one run may be active for a schedule:

- **Run now** is unavailable while one is preparing or running.
- If an automatic run becomes due while another run is active, the due run
  waits.
- After the active run finishes, all missed cron times are coalesced into one
  automatic run. The following run returns to the original cron cadence.

If the Sweat server was offline while one or more times became due, it starts
one delayed run after restart and then resumes the original cadence. A delayed
run records its intended time so the UI can label it. An active run interrupted
by a server restart follows the existing run lifecycle and becomes failed; it
is not retried automatically.

Automatic runs are attributed to the workspace and record their intended cron
time. Manual runs record the member who selected **Run now**. Neither is
misattributed to the schedule creator.

## Editing and lifecycle

Editing a schedule affects future runs only. Saving a new cron expression or
timezone calculates the next run strictly after the save time; it does not
backfill times implied by the new expression.

Pausing prevents new automatic runs. It does not cancel an active run, and
**Run now** remains available. Resuming calculates the next run strictly after
the resume time, so time spent paused is not caught up.

Archiving prevents new runs and hides the schedule from the active list. It
does not cancel an active run or remove configuration, history, steps, or
results. An archived schedule must be restored before it can run again; restore
returns it to `paused` so a member deliberately resumes it.

There is no hard-delete operation in this slice.

## Capabilities and inputs

Scheduling changes when delegation begins, not what the selected agent may do.
A schedule run may perform external writes when the current agent definition
and workspace policy grant them.

Grants remain run-scoped and expire with the run. A context-specific capability
is available only when that context exists: a roomless schedule run cannot
receive `workspace.room`, while repository, Linear, GitHub, and future
workspace-level capabilities remain eligible under their normal policies.

Schedules do not accept room attachments in this slice. Inputs such as the
configured repository are resolved when each run starts, so a recurring release
notes run sees the repository revision current at that time.

## Failure behavior

Invalid names, blank tasks, invalid cron expressions, unknown timezones, and
unknown agent definitions are rejected when creating or editing a schedule.

If a previously valid agent or required workspace configuration becomes
unavailable, the automatic attempt is retained as a failed schedule run and
the schedule advances to its next cron time. It is not paused automatically.
Manual start failures are also retained and shown to the caller.

There are no automatic retries. A member can inspect the failure and choose
**Run now**.

## Acceptance checks

- A member can create `0 9 * * 5` in `Europe/Copenhagen`, see its description
  and next three times, and save it only when all fields are valid.
- Every member sees the same schedules, tasks, capabilities, run activity, and
  results and can manage them.
- A due schedule creates a bounded sandbox run without creating or changing a
  room record.
- **Run now** starts an extra run and leaves the next automatic time unchanged.
- Concurrent manual and automatic starts produce at most one active run for a
  schedule.
- Missed times caused by a long run or server downtime produce one delayed run,
  not one run per missed time.
- Editing changes future runs without mutating active or completed history.
- Pausing, resuming, archiving, and restoring follow the lifecycle above and
  never delete results.
- Suspending the creator does not stop the schedule.
- Each run resolves current policy and receives a fresh, expiring capability
  grant; no long-lived credential is persisted.
- Live steps, cancellation, terminal state, and retained result behave like
  existing room-delegated runs.

## Outside this slice

- Posting scheduled tasks or results into rooms
- Personal or private schedules
- Granular schedule-management permissions
- Spend budgets, quotas, or rate controls beyond existing run limits and the
  one-active-run invariant
- Seconds, one-time schedules, calendars, or a visual recurrence builder
- Event, webhook, or dependency triggers
- Chaining one schedule's structured output into another run
- Attachments or generic durable artifacts
- Notifications or attention badges for schedule results
- Automatic retries
- A distributed scheduler, external queue, or multi-server coordination
