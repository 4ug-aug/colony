# Agent runs

Runs use the generic `RunExecutor` API. A composition registers an agent
definition, then callers start and poll runs by ID.

```ts
const executor = createLightAgentExecutor();
const id = executor.startRun({
  agentDefinitionId: "light-agent",
  task: "hello",
});
```

The executor owns sandbox creation, optional workspace preparation, runtime
execution, output retention, cancellation, and cleanup.

## Tests

```bash
bun test
```

The native-container end-to-end test is opt-in:

```bash
container system start
RUN_CONTAINER_E2E=1 bun test e2e/light-agent.e2e.test.ts
```

## Software engineer CLI

From `project/`, install dependencies and start Apple Container:

```bash
bun install --frozen-lockfile
container system start
bun run agent:build
```

Apple Container needs a DNS rule for the sandbox to reach the host-owned MCP
gateway. Check it after every macOS restart:

```bash
container system dns list
```

If `host.container.internal` is absent, create it:

```bash
sudo container system dns create host.container.internal --localhost 203.0.113.113
```

Then run the agent. The model variables are required; the Linear token is
optional unless the task needs Linear. To give a software-engineer run a Git
workspace and permission to publish a PR, authenticate the host GitHub CLI and
set its repository scope:

```bash
gh auth login -h github.com

LLM_BASE_URL=https://api.openai.com/v1 \
LLM_API_KEY=... \
LLM_MODEL=... \
LINEAR_MCP_API_KEY=... \
SWEAT_GITHUB_REPOSITORY=4ug-aug/sweat-v2 \
SWEAT_GITHUB_BASE=main \
SWEAT_VERIFY_COMMAND='bun install --frozen-lockfile && bunx tsc -p tsconfig.json --skipLibCheck && bun test' \
bun run agent:software-engineer -- "Investigate this task and report your findings."
```

The CLI creates one host-owned, run-scoped Sweat session containing the
available Linear and GitHub adapters. GitHub authentication stays on the host;
the sandbox receives neither a GitHub token nor a provider credential.
`SWEAT_VERIFY_COMMAND` runs in the sandbox before the GitHub adapter publishes
a PR. Without it, the run has no pull-request capability.

### Troubleshooting

If a run waits for several minutes and ends with `Connection error.`, verify
outbound HTTPS from the exact agent image:

```bash
container run --rm sweat-agent:latest bun -e \
  'const r=await fetch("https://api.openai.com/v1/models",{signal:AbortSignal.timeout(10000)}); console.log(r.status)'
```

`401` is expected without credentials and proves the network path works. A
timeout means Apple Container's NAT is stale. Restart it, then rerun the DNS
and HTTPS checks:

```bash
container system stop
container system start
```

`container logs` does not show agent output: PID 1 is only the sandbox's idle
process, while the agent runs through `container exec`. The CLI currently
captures that output and prints it when the run finishes. Use
`container system logs --last 30m` for Apple Container lifecycle diagnostics.

Use `SWEAT_MCP_HOST` to override the advertised host for another local
forwarding setup.
