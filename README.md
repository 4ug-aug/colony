# Sweat

Sweat is a self-hosted multiplayer workspace where people delegate work to
isolated AI agents and collaborate around the results. Its intended primary
experience is a Tauri desktop application backed by the same static client
available in a browser.

Authenticated users share `General` and can create additional shared public
rooms. Messages, delegated runs, and realtime activity remain isolated to the
room where they occur.

Read [VISION.md](./VISION.md) for the product direction,
[CONTEXT.md](./CONTEXT.md) for the domain language, and
[docs/architecture.md](./docs/architecture.md) for the current architecture.

The implementation lives in [`project/`](./project/).

For local two-user testing, `make dev` seeds `admin@sweat.local` and
`teammate@sweat.local`; both use the password `change-me-now`.
