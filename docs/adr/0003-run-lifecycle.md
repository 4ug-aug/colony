# Runs have explicit terminal outcomes

Status: accepted

A run transitions through preparation and execution to exactly one terminal
outcome: `succeeded`, `failed`, or `cancelled`.

Cancellation is a platform operation, not an agent tool. The executor requests
provider-specific sandbox termination, revokes the capability session, and
removes prepared resources. The initial Apple Container implementation may
dispose the container directly; future providers choose their own stop
mechanism behind the sandbox port.

The first lifecycle does not require a scheduler or restart recovery.
