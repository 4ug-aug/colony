# Sandbox hardening backlog

Two known gaps in the sandbox trust boundary. Neither is a live vulnerability
on its own — both need an attacker who already has code running in a sandbox
or on the LAN — but both are wider than they need to be. Recorded here so the
next person picking up sandbox work does not have to rediscover them.

## Sandbox egress is unrestricted

`smolvmCreateFlags` passes a bare `--net`, so a sandbox reaches anything the
host's network reaches, including the LAN and every host on it. An agent that
runs untrusted dependency code — which is most of what a software engineer
run does — inherits that reach.

smolvm already supports `--allow-host` and `--allow-cidr`; Colony passes
neither. Tightening means adding an allowlist alongside the `--net` flag in
`project/providers/smolvm-sandbox.ts`.

The reason this is not done yet is that the correct list is workload
dependent. A run needs the coordinator's capability endpoint, the GitHub API,
the model provider, and whichever package registries the checked-out
repository builds against. Guessing that set wrong does not fail loudly — it
fails as a build that hangs on a blocked host. Any attempt should ship with
the deny reason surfaced in the run's output, not just in the guest's kernel.

## The MCP gateway listens on 0.0.0.0 over plain HTTP

The capability endpoint binds `0.0.0.0` and speaks HTTP with no TLS, so any
host on the LAN can reach it and any host on the path can read the bearer
token.

The bind is wide because loopback does not work for every sandbox kind:
publishing a Preview port switches smolvm from its TSI network backend to
virtio-net, and a virtio-net guest cannot reach the host's `127.0.0.1`. The
host's LAN address is the only route a container guest, a TSI guest, and a
virtio-net guest all share, which is why `capabilityHost` advertises it.

What holds the line today is the bearer token: a `crypto.randomUUID()` per
session, checked on every request, scoped to a per-session tool allowlist,
with expiry re-checked on each call and an ephemeral port closed on revoke.

Two independent tightenings are available. Binding to the host's LAN address
rather than `0.0.0.0` narrows the listener without breaking any guest, since
that is already the address guests are told to use. TLS with a self-signed
certificate — Colony already mints a CA for the Docker provider — would stop
the token travelling in clear text. Neither changes the guest-facing contract.
