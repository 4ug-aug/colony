---
status: accepted
---

# smolvm is the default sandbox provider

Colony sandboxes are composed behind the existing `SandboxProvider` port
(create, exec, dispose, plus Preview). The operator still must set
`SWEAT_SANDBOX_PROVIDER` at startup; a missing or invalid value fails with the
accepted list. That list is now `smolvm`, `apple-container`, and `docker`.
Setup writes `smolvm` as the default. Executors and runtimes still do not read
deployment configuration or know whether a sandbox is a microVM or a
container.

This amends ADR 0007: explicit composition stays; the value set and the
intended default change. Apple Container and Docker remain an escape hatch,
not a second product path. Env identifiers stay `SWEAT_*` until a later
migration. Git-workspace persons keep their existing image family; the smolvm
adapter is what adds Docker-in-VM so a Preview command such as `make dev` can
run the project's own containers inside that one VM.

Rejected: making smolvm the implied value when the env is unset (hides
operator intent); dropping container providers in this slice; a distinct
environment image for Preview runs; forwarding the dedicated host's Docker
socket into the guest.
