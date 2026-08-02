# Sweat server

This release contains the production server bundle and the agent image build
context. It currently targets macOS because Sweat uses Apple Container to
isolate agents.

## Run

For a source checkout, run `make setup` from the repository root. The archive
instructions below are for the standalone server release bundle.

Install [Bun 1.3.5 or newer](https://bun.com/docs/installation) and either
[Apple Container](https://github.com/apple/container) or Docker, then from this
directory:

```bash
cp .env.example .env.local
openssl rand -base64 32
```

Put the generated value in `.env.local` as `BETTER_AUTH_SECRET`. If the server
is not local, also set `BETTER_AUTH_URL` to its reachable URL. Then run:

```bash
container system start
(cd agent && container build -t sweat-agent:latest .)
bun src/server/coordinator.js
```

For Docker, set `SWEAT_SANDBOX_PROVIDER=docker` in `.env.local` and replace the
two container commands with `docker build -t sweat-agent:latest agent`.

The server listens on port 3001. On first startup, copy the setup token it
prints and use it in the Sweat desktop app. The database defaults to
`sweat.sqlite`; back it up together with the sibling `attachments/` directory.
