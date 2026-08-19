---
status: accepted
---

# Every person boots the configured sandbox provider

ADR 0027 split the sandbox provider per person: `includeRepository` people got
the microVM, everyone else got a container. Its whole argument was cost —
"every workspace person started paying a microVM boot for it" — measured when
a boot was `machine create` plus `machine start`, 7.5s on the real agent image.

Golden-fork sandboxes removed that cost. A run now forks a warm golden in
**0.23s**, and inherits a started dockerd with it. The saving ADR 0027 bought
is gone, so its one reason to exist is gone with it. `sandboxes` takes the
configured provider for every person again.

The split also cost more than boot time. A container sandbox advertises
`host.container.internal` as its host gateway
(`project/providers/docker-sandbox.ts:49-67`), and `capabilityUrlForSandbox`
prefers a sandbox's own gateway over the process-wide host. Under rootless
Docker that address cannot reach the host's loopback without a dockerd
drop-in, so a non-repository person's MCP gateway was refused while a
repository person's — reaching the same gateway through the microVM's
`10.0.2.2` — worked. One sandbox mechanism has one networking story.

The cost of undoing it is memory: goldens are keyed by resolved image, and the
two roles use different images, so a workspace exercising both holds two
goldens rather than one. Each is roughly 3GB of guest RAM, released after
`GOLDEN_IDLE_TTL_MS`. That is the trade — RAM while warm, against a second
sandbox mechanism and its own host-networking prerequisite.

`SWEAT_CONTAINER_PROVIDER` stays. It still selects which builder `make agent`
uses to produce the agent images, and which provider boots sandboxes when
`SWEAT_SANDBOX_PROVIDER` is itself a container. It no longer decides anything
per person.

This supersedes [ADR 0027](0027-container-sandbox-for-people-without-a-repository.md)
and restores [ADR 0024](0024-smolvm-default-sandbox-provider.md) to its
original meaning: the default sandbox provider is the default for everyone.

Rejected: keeping the split and documenting the rootless-Docker drop-in as a
requirement (two sandbox mechanisms, two networking stories, and the drop-in
is invisible until an agent's capabilities are refused mid-run); giving
non-repository people a smaller VM image to shrink the second golden (a third
image to build and keep current, for RAM that a TTL already reclaims).
