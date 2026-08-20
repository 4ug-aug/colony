# Room agent mentions start every named run and ping only the invoker

An Account can `@mention` several agent definitions in one Room message; Colony
starts one Room-linked run per named definition with that message as the Task
(no slicing). Those runs are peers. Room-linked runs are warm per thread and
agent definition (`followUp`, ADR 0020): a later `@` of the same definition in
that thread continues the warm run; idle TTL recycles it like Chat and Grill;
the next `@` starts a new run that can still read the thread. We do not park a
worker until pinged.

When an **agent** `@mention`s another agent, that starts (or follows up) a
Room-linked run. Completing it produces an **invocation ping** — a follow-up to
the mentioning agent only, one ping per finished run, Task including that
result. An Account naming two agents does not ping them when a sibling
finishes. Room invocation is not Issue hand-off (ADR 0014) and not an
in-sandbox subagent.

We rejected dispatching only the first `@`, using Issues as the Room hand-off,
keep-alive until ping, waking every peer from the same Account message, and
one barrier ping after every spawned run completes.
