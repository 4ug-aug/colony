---
status: accepted
---

# Preview is an Account surface on Git-workspace runs

When a run's entrypoints prepared a Git workspace and the workspace has a
Preview command, the orchestrator runs optional finite init as an entrypoint,
then starts the Preview command in the same sandbox without waiting for it to
become reachable, then starts the agent. One VM, Colony agent image, one
workspace-configured guest port forwarded for Accounts. Missing Preview
command skips the whole path. Init failure fails the run. If the Preview
command exits, Preview is dead and the run continues.

Preview is not a Step and not an agent tool. The agent gets an auditable Task
note that the command was started — not a URL, port, or extra env. The
Account-facing UI is a later slice; this one records enough backend state to
serve it.

Sandbox dispose no longer always follows the run terminal: succeeded and
failed runs keep the sandbox up for a workspace-owned grace duration so
Accounts can still open Preview; cancelled runs dispose immediately. Grace
applies only when a Preview process was started. MCP sessions still revoke
when the run terminals.

Preview lives on the sandbox contract so every provider can implement
bring-up, port forward, and grace. Docker-in-VM is smolvm-specific. One
Preview configuration on the Colony Workspace (administrator), not per person
and not in the Git repository. `SWEAT_VERIFY_COMMAND` stays a separate
publish-time check.

Rejected: gating the agent on Preview readiness; Preview outliving the run
until an Account stops it; injecting a Preview URL into the launch contract;
hard-binding Preview to the software-engineer name rather than to a prepared
Git workspace.
