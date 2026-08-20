# Chat is a private multi-turn home on the Run spine

Accounts need a durable 1:1 conversation with one agent definition without
turning Oneshot into a session or inventing a private Room. A **Chat** is that
home: an account-owned transcript plus a Chat-linked warm run (`warm` /
`followUp`, ADR 0020) so follow-ups keep provider continuity. Idle TTL recycles
the spine; the next send starts a new warm run rehydrated from the persisted
transcript. We rejected stretching Oneshot (it stays a single-turn panel, ADR
0021), using a Room as a DM, and a parallel non-Run chat runtime.
