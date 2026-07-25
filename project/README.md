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

```bash
bun run agent:build

LLM_BASE_URL=https://api.openai.com/v1 \
LLM_API_KEY=... \
LLM_MODEL=... \
LINEAR_MCP_API_KEY=... \
bun run agent:software-engineer -- "Investigate this task and report your findings."
```

Capability sessions are optional. Set `LINEAR_MCP_API_KEY` to let the CLI
create a host-owned, run-scoped Linear session; the provider credential never
enters the sandbox.

Apple Container needs a host-service DNS rule to reach the host gateway. Set
it up once (the rule is removed after a macOS restart):

```bash
sudo container system dns create host.container.internal --localhost 203.0.113.113
```

Use `SWEAT_MCP_HOST` to override the advertised host for another local
forwarding setup.
