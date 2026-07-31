# Sweat

Sweat is a self-hosted multiplayer workspace where people delegate work to
isolated AI agents and collaborate around the results. Its intended primary
experience is a Tauri desktop application backed by the same static client
available in a browser.

Authenticated users share `General` and can create public or member-restricted
private rooms. Messages, delegated runs, and realtime activity remain isolated
to the room where they occur.

Read [VISION.md](./VISION.md) for the product direction,
[CONTEXT.md](./CONTEXT.md) for the domain language, and
[docs/architecture.md](./docs/architecture.md) for the current architecture.
Workspace admission is specified in
[docs/account-admission.md](./docs/account-admission.md).

The implementation lives in [`project/`](./project/).

Copy `.env.example` to `.env.local` and add a stable `BETTER_AUTH_SECRET`.
After setup, an administrator configures the model provider in Workspace Settings.
This root file is the only environment file used by the development commands. Existing installations are migrated automatically from
the former `project/gui/.env.local` location.

`make dev` migrates the database, builds the agent image, and starts an empty
invite-only workspace. On first successful server startup, copy the one-time
setup token printed by the coordinator into the browser to create the
administrator.

To give room-launched software engineers a repository workspace, authenticate
the host GitHub CLI and set `SWEAT_GITHUB_REPOSITORY`. Also set
`SWEAT_VERIFY_COMMAND` to grant pull-request publishing; the command must pass
inside the sandbox before a branch is published.

For local two-user testing, `make dev-seeded` performs the same complete startup
and creates
`admin@sweat.local` and `teammate@sweat.local`; both use the password
`change-me-now`.

If the initial setup token is lost, run `make rotate-setup-token` before an
administrator exists. `make reset-admin-password` securely prompts for a new
password. Run `make help` for the complete command list.

To emulate the desktop-client boundary, run `make server` in one terminal and
`make gui` in another.
