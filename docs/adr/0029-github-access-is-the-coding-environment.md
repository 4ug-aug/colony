---
status: accepted
---

# GitHub access is the coding environment

GitHub access on an agent definition is the coding-environment grant: it
prepares the workspace repository under `/work`, makes scoped GitHub tools
eligible, enables the runtime-builtin shell, and boots the run on the
configured sandbox provider (`smolvm` by default). Without it the person is a
collaborator — MCP tools and attachments, no shell, container sandbox.

ADR 0028 put every person on the configured provider because golden-fork
removed the microVM boot cost that ADR 0027 had been avoiding. That cost
argument still holds, but it is no longer the reason a collaborator needs a
microVM. Smolvm exists for Docker-in-VM and isolation of arbitrary shell.
A person with no GitHub access has neither a git workspace nor a shell, so
the VM buys nothing and still costs a second golden.

The roster therefore takes two providers again: `sandboxProvider` for GitHub
access, `containerProvider` (`SWEAT_CONTAINER_PROVIDER`) for the rest. When
`SWEAT_SANDBOX_PROVIDER` is itself a container, both are that provider.
Shell is not a Colony MCP capability; each in-sandbox runtime strips its
builtin (`exec_command` / Cursor `disallowedTools: ["shell"]`) unless the
definition snapshot has GitHub access.

Rootless Docker may still fail to route `host.container.internal` to the MCP
gateway. `SWEAT_MCP_HOST` and `capabilityUrlForSandbox` remain the escape
hatch; this slice does not add a third provider.

This supersedes [ADR 0028](0028-every-person-boots-the-configured-sandbox.md)
and restores the per-person split from
[ADR 0027](0027-container-sandbox-for-people-without-a-repository.md) under a
new reason. [ADR 0024](0024-smolvm-default-sandbox-provider.md) stays the
default for GitHub-access persons.

Rejected: no sandbox at all for collaborators (the agent loop still runs via
`sandbox.exec`, and model keys plus MCP tokens stay off the host); a separate
shell toggle besides GitHub access (two flags for one coding environment);
keying the split on runtime kind (a Cursor person without GitHub access is
still not a coding environment).
