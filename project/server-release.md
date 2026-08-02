# Sweat server

This release contains the production server bundle. The agent image is
published separately to GitHub Container Registry and supports both Docker and
Apple Container.

## Run

For a source checkout, run `make setup` from the repository root. The archive
instructions below are for the standalone server release bundle.

Install [Bun 1.3.5 or newer](https://bun.com/docs/installation) and either
[Apple Container](https://github.com/apple/container) or Docker, then from this
directory:

```bash
cp .env.example .env.local
```

Set `BETTER_AUTH_SECRET`, `SWEAT_SANDBOX_PROVIDER`, and
`SWEAT_AGENT_IMAGE=ghcr.io/4ug-aug/sweat-v2-agent:<release-tag>` in
`.env.local`, replacing `<release-tag>` with the GitHub release tag. Pull the
published image and start the selected runtime:

```bash
container system start
container image pull ghcr.io/4ug-aug/sweat-v2-agent:<release-tag>
bun src/server/coordinator.js
```

For Docker, replace the two container commands with:

```bash
docker pull ghcr.io/4ug-aug/sweat-v2-agent:<release-tag>
bun src/server/coordinator.js
```

If the package is private, authenticate the selected container runtime with
GitHub Container Registry before pulling.

The server listens on port 3001. On first startup, copy the setup token it
prints and use it in the Sweat desktop app. The database defaults to
`sweat.sqlite`; back it up together with the sibling `attachments/` directory.
