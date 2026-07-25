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
bun run agent:software-engineer -- "Investigate this task and report your findings."
```

V1 does not bind capability grants or MCP sessions. Repository inputs and
capability sessions are separate follow-up slices.
