# Grill-linked warm follow-up runs

## Description

Extend the Run spine so a **Grill-linked run** can stay warm across frontier
submits: keep the same provider agent instance and feed each submit as a
follow-up turn (Cursor multi-`send` / OpenAI session-style continuity), instead
of one-shot create→dispose every round.

On idle TTL, recycle the warm run; durable Grill state remains on the Grill so
the next submit seamlessly starts a new warm run with rehydration. Do not invent
a parallel non-Run session orchestrator.

Today’s runtimes are one-shot; this issue is the platform change that unlocks
true conversational grilling (see ADR 0020).

## Why is this important?

Per-submit containers waste compute and discard provider conversation context
(especially Cursor). Warm follow-ups are the agreed product intent for Grills.

## Acceptance Criteria

- [ ] Grill-linked run accepts follow-up user submits without disposing the
      provider agent between rounds while warm
- [ ] Cursor path uses multi-`send` (or equivalent resume) on one Agent instance
- [ ] OpenAI Agents path preserves conversation continuity across submits
      (session / conversation continuity APIs as appropriate)
- [ ] Idle TTL recycles resources; next submit rehydrates from Grill state
      without requiring a manual Resume action
- [ ] Grill end/abandon disposes the warm run
- [ ] Behavior documented against ADR 0020; no second orchestrator beside Run

## Additional Information (Optional)

- Parent: GRL-000
- Depends on: GRL-001 (Grill id + rehydration snapshot)
- Related research: `docs/research/cursor-provider.md`; installed SDK APIs for
  multi-send / session are unused by Sweat today
- Materialize/publish may be a final phase of this run or a trailing run —
  [NEEDS CLARIFICATION at implement time; same product outcome]
