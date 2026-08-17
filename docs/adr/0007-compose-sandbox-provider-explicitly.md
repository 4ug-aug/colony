---
status: superseded by ADR-0024
---

# Compose the sandbox provider explicitly

The Sweat server must receive `SWEAT_SANDBOX_PROVIDER` at startup and accept
only `apple-container` or `docker`; a missing or invalid value fails startup
with a message that lists those values. The executable composition creates the
selected `SandboxProvider` and injects it into the run composition. Reusable
executors and runtimes neither read deployment configuration nor know which
container technology runs a sandbox, so Docker is a direct adapter swap for
Apple Container behind the existing create, exec, and dispose contract.

Superseded by [ADR 0024](0024-smolvm-default-sandbox-provider.md): the
explicit-composition rule stands; accepted values add `smolvm` as the default.
