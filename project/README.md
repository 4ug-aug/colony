# Agent sandboxes

Agents depend on two ports:

- `SandboxProvider` creates and owns an isolated execution environment.
- `AgentProvider` runs an agent inside that environment.

The application composes them with `createAgentRunner`.

## Tests

```bash
cd project
bun test
```

The native-container end-to-end test is opt-in. Install Apple's `container`
CLI and start it first:

```bash
container system start
cd project
bun run test:e2e
```

The light agent is deterministic and credential-free. It proves creation,
execution, output, and cleanup through a real Apple container.

## Agent providers

`createCommandAgentProvider` supports any agent CLI included in the sandbox
image:

```ts
const codex = createCommandAgentProvider({
  command: ({ prompt }) => ["codex", "exec", prompt],
});

const claude = createCommandAgentProvider({
  command: ({ prompt }) => ["claude", "-p", prompt],
});
```

The image is responsible for installing and authenticating the selected
agent CLI.

## Software engineer runtime

Build the generic Bun runtime image once:

```bash
bun run agent:build
```

Run the software engineer from the terminal with any OpenAI-compatible model:

```bash
LLM_BASE_URL=https://api.openai.com/v1 \
LLM_API_KEY=... \
LLM_MODEL=... \
bun run agent:software-engineer -- "Investigate this task and report your findings."
```

The model key is only given to the runtime process; shell commands launched by
the agent do not inherit it. Linear MCP access is intentionally not connected
until the platform MCP gateway can issue a scoped session.
