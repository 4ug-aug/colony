---
name: eval-antboy
description: Evaluate Antboy Oneshot performance against a running local Colony server. Use when evaluating Antboy, testing Oneshot capabilities, judging agent performance, or running a local Antboy eval task.
---

# Evaluate Antboy

Run a real Antboy **Oneshot** against the local coordinator. Do not simulate, do not mention `@antboy` in a Room, and do not use `software-engineer`.

## Preconditions

1. Coordinator is up (`make dev` or `make server`). Default API is `http://localhost:3011` (`SWEAT_COORDINATOR_PORT` / `VITE_SWEAT_API_URL` in `.env.local`).
2. LLM provider is saved on the Workspace page. Antboy uses that config, not Cursor runtime.
3. Session cookie. Seeded accounts (`make dev-seeded`): `admin@sweat.local` / `change-me-now`.

Every request needs `Origin` matching the GUI (`SWEAT_GUI_ORIGIN`, default `http://localhost:3010`). Missing Origin is `403`.

```bash
API="${VITE_SWEAT_API_URL:-http://localhost:3011}"
ORIGIN="${SWEAT_GUI_ORIGIN:-http://localhost:3010}"
COOKIE=/tmp/colony-eval-cookies
```

## Run

Sign in, free the one-per-account slot if needed, start, poll, inspect.

```bash
curl -sS -c "$COOKIE" -X POST "$API/api/auth/sign-in/email" \
  -H "origin: $ORIGIN" -H 'content-type: application/json' \
  -d '{"email":"admin@sweat.local","password":"change-me-now"}'

# 409 if a Oneshot is already active — GET then DELETE it first
curl -sS -b "$COOKIE" -H "origin: $ORIGIN" "$API/api/oneshots/active"

curl -sS -b "$COOKIE" -c "$COOKIE" -X POST "$API/api/oneshots" \
  -H "origin: $ORIGIN" -H 'content-type: application/json' \
  -d '{"task":"<TASK>","agentDefinitionId":"antboy"}'
# expect 202 { run: { id, state, ... } }

# poll until succeeded | failed | cancelled (sandbox prepare can take minutes)
curl -sS -b "$COOKIE" -H "origin: $ORIGIN" "$API/api/oneshots/<run-id>"
# { run, steps[] }
```

Do not send `repositoryBase`. Discard with `DELETE /api/oneshots/<run-id>` when the eval is done unless the user wants to keep the panel open.

`run.stdout` is the final answer. `steps` are `{ kind, tool?, text, callId? }` with `kind` of `message` | `tool_call` | `tool_result`. Pair calls and results by `callId`.

## Contract (what good looks like)

Oneshot grant: no Room tools; single bounded Task; complete answer in the final response; no waiting on clarifying questions.

Antboy: no GitHub checkout or PR tools; do not invent missing context; do not use `workspace.post_message` for the final result; only call granted tools; shell is inspection / light work under `/work`.

When those connections exist: Issues via `workspace.*_issue*`; Outline via `outline.list_documents` then `outline.fetch` (`resource: "document"`); Grafana via targeted queries, not full dashboard JSON; Asana when asked.

## Report

Lead with a one-line verdict (`pass` / `mixed` / `fail`), then:

- **Outcome** — state, error if any, quoted or summarized `stdout`
- **Tools** — names in order; flag Room/GitHub calls, unused tools the task required, failed `tool_result`s
- **Following** — invented context, questions-and-wait, `post_message` as the answer, incomplete Oneshot
- **Notes** — sandbox/LLM/config failures vs agent behavior (only the latter is Antboy performance)

If the user did not give a task, pick one that matches a granted capability and state it before running.
