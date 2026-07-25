# A run snapshots its resolved agent definition

Status: accepted

When a run is created, the composition layer resolves and snapshots the agent
definition used for execution: instructions, model configuration, runtime/image,
requested capabilities, and execution policy.

The executor receives that snapshot. Later edits to an agent definition,
including operator prompt tuning, do not alter an existing run's meaning or
audit record. A future definition store can add identifiers and versions without
changing this execution contract.
