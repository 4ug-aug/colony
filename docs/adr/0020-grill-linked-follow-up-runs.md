# Grill-linked runs accept follow-up submits

A Grill is driven by a Grill-linked run that stays warm across round submits
and keeps the same provider agent instance so follow-ups are true multi-turn
conversation (Cursor multi-`send` / OpenAI session-style continuity), instead
of paying a fresh one-shot run and losing model context on every submit. Idle
TTL recycles the warm run seamlessly in the UX; durable Grill state (frontier,
answers, draft artifacts) still lives on the Grill so a recycled run rehydrates
when continuity was broken. Authoritative decisions use a structured Grill
frontier with explicit submit; timeline narration is secondary. We rejected
making every submit a new one-shot run as the steady-state design: it fits
today’s executor, but wastes compute and throws away conversational continuity.
We also rejected a parallel non-Run “session runtime”: Grill should extend the
Run spine with follow-ups, not invent a second orchestrator.
