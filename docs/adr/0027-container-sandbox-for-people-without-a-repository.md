---
status: superseded by ADR-0028
---

# People without a repository boot a container, not a microVM

ADR 0024 made smolvm the default sandbox provider, and every workspace person
started paying a microVM boot for it. The reason smolvm exists is Docker-in-VM
for Preview, which only a person holding a git workspace can use. Antboy holds
no checkout and opens no pull requests, so the VM buys it nothing.

The roster already records which persons get a checkout as
`includeRepository`, so the executor now takes a provider per person rather
than one for the workspace: `sandboxProvider` boots the persons that get a
repository, `containerProvider` boots the rest. Operators pick the second one
with `SWEAT_CONTAINER_PROVIDER`, accepting `apple-container` or `docker`. It
is only read when `SWEAT_SANDBOX_PROVIDER` is `smolvm`; under either container
provider both roles are that provider and the variable is ignored. `make
setup` asks for it and `make agent` builds the agent images for it, since a
smolvm sandbox boots an archive exported from the same local image anyway.

This amends ADR 0024: smolvm stays the default, but "default sandbox
provider" now means the default for git-workspace persons. Explicit
composition from ADR 0007 is unchanged — a missing or invalid value still
fails with the accepted list.

Superseded by [ADR 0028](0028-every-person-boots-the-configured-sandbox.md):
golden-fork sandboxes cut a microVM boot to 0.23s, so the cost this ADR
avoided no longer exists and every person boots the configured provider again.

Rejected: keying the choice on the person's runtime kind or agent image
(the same rule stated indirectly, and it breaks the moment a cursor person
stops taking a checkout); giving non-repository persons no sandbox at all
(drops the isolation boundary their shell still needs); a third environment
variable per person (an operator does not choose a sandbox per teammate).
