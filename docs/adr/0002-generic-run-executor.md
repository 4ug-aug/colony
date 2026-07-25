# Generic run executor

Status: accepted

Sweat starts runs asynchronously through a generic executor backed by an
in-memory run-store port. The executor receives a resolved agent-definition
snapshot, plain-text task, optional prepared workspace input, and an optional
already-resolved capability grant; it knows neither role names, provider
credentials, nor gateway transport.

V1 has `preparing` and `running` active states and `succeeded`, `failed`, and
`cancelled` terminal states. Cancellation is idempotent and wins before a
terminal state; cleanup is required for success. Definitions cap duration and
retained output, runs may only lower those caps, and output is stored as bounded
stdout/stderr tails. Definitions use a 30-minute maximum duration and a 1 MiB
maximum retained size per stream in the shipped compositions. V1 defers durable
stores, queues, prompt tuning, artifacts, and communication channels.
