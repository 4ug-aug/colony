---
status: accepted
---

# smolvm machines are driven through the CLI, not the SDK

The smolvm adapter of ADR 0024 creates, execs and deletes microVMs by running
the `smolvm` binary, rather than embedding the `smolmachines` Node SDK. The
SDK dependency is dropped; `make setup` fails when the CLI is missing.

Two SDK limits make it unusable for Colony as of smolmachines 1.8.3. It parses
`MachineConfig.image` as a registry reference, so the locally built agent
images `make agent` produces cannot boot — a `docker save` archive is
normalised into `docker.io/<path>` and pulled. And both `Machine.create` and
`Machine.connect` block until every published port accepts a connection, which
a Preview port only does once the Preview command runs — so a Preview sandbox
times out before its agent starts. The CLI has neither limit: it accepts a
local archive and returns as soon as the guest agent is up.

The port and mount settings the SDK took as config are the same values the CLI
takes as flags, so the adapter's shape is unchanged: one `SmolMachine` with
`exec` and `delete` behind the `SandboxProvider` port. Streaming output comes
from the child process's own pipes instead of the SDK's event stream, which
also removes the split between buffered `exec` and streaming `execStream`.

The cost is that a CLI-created machine outlives a crashed coordinator, where
an SDK machine died with the process. Runs dispose their sandbox on every exit
path, so this only bites on a hard crash; reaping strays is left to a later
slice.

Rejected: keeping the SDK for registry images and using the CLI only for local
archives (two machine implementations for one port); publishing agent images
to a registry so the SDK could pull them (a release pipeline to work around a
parser); a local registry container (a daemon to avoid a subprocess).
