import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  createAppleContainerClient,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from "../sdk/src";
import { createAppleContainerSandboxProvider } from "../providers/apple-container-sandbox";
import {
  ANTBOY_ID,
  SOFTWARE_ENGINEER_ID,
  createWorkspaceAgentsExecutor,
  type WorkspaceAgentAdapter,
} from "./software-engineer";

const cursorConfig = () => ({
  apiKey: "cursor-key",
  model: "composer-2.5",
});

const modelConfig = () => ({
  baseUrl: "https://models.example/v1",
  apiKey: "test-key",
  model: "test-model",
});

test("software-engineer resolves to cursor kind with repository inputs and github grant", async () => {
  const calls: Array<{ args: readonly string[]; options?: CommandOptions }> =
    [];
  const runner: CommandRunner = {
    async run(args, options): Promise<CommandResult> {
      calls.push({ args, options });
      const stdout =
        args[0] === "exec"
          ? `${JSON.stringify({ kind: "message", text: "done", at: 1 })}\n`
          : "";
      if (stdout) options?.onOutput?.({ stream: "stdout", text: stdout });
      return { args, exitCode: 0, stdout, stderr: "" };
    },
  };
  let preparedRepository: string | undefined;
  const adapter: WorkspaceAgentAdapter = {
    repository: {
      input: {
        type: "repository",
        provider: "github",
        repository: "acme/widgets",
        revision: "main",
      },
      source: {
        provider: "github",
        async checkout(_input, directory) {
          await writeFile(`${directory}/README.md`, "widgets");
          return { revision: "abc123" };
        },
      },
    },
    capability: {
      id: "github.pull-requests",
      resources: [{ provider: "github", repository: "acme/widgets" }],
      createUpstream({ workspace }) {
        preparedRepository = workspace?.git?.repository;
        return {
          async listTools() {
            return [
              { name: "github.create_pull_request" },
              { name: "github.wait_for_pull_request_checks" },
            ];
          },
          async callTool() {
            return {};
          },
        };
      },
    },
  };
  let configuredCursor = cursorConfig();
  const executor = createWorkspaceAgentsExecutor({
    cursor: () => configuredCursor,
    model: modelConfig,
    cursorImage: "sweat-agent-cursor:test",
    image: "sweat-agent:test",
    adapters: [adapter],
    createCapabilityEndpoint: () => ({
      url: "http://capabilities.example/mcp",
      close: async () => {},
    }),
    sandboxProvider: createAppleContainerSandboxProvider({
      container: createAppleContainerClient(runner),
      createId: () => "run-1",
    }),
  });

  const id = executor.startRun({
    task: "fix the issue",
    agentDefinitionId: SOFTWARE_ENGINEER_ID,
  });
  configuredCursor = { ...configuredCursor, model: "changed-after-start" };
  while (["preparing", "running"].includes(executor.getRun(id)?.state ?? "")) {
    await Bun.sleep(0);
  }

  const run = executor.getRun(id)!;
  expect(run.definition.id).toBe(SOFTWARE_ENGINEER_ID);
  expect(run.definition.runtime.kind).toBe("cursor");
  expect(run.definition.runtime.cursor?.model).toBe("composer-2.5");
  expect(run.definition.runtime.image).toBe("sweat-agent-cursor:test");
  expect(run.inputs).toEqual([adapter.repository!.input]);
  expect(run.capabilityGrant?.tools).toEqual([
    "github.create_pull_request",
    "github.wait_for_pull_request_checks",
  ]);
  expect(run.capabilityGrant?.resources).toEqual([
    { provider: "github", repository: "acme/widgets" },
  ]);
  expect(preparedRepository).toBe("acme/widgets");
});

test("antboy resolves to openai-agents without repository inputs or github tools", async () => {
  const runner: CommandRunner = {
    async run(args, options): Promise<CommandResult> {
      const stdout =
        args[0] === "exec"
          ? `${JSON.stringify({ kind: "message", text: "done", at: 1 })}\n`
          : "";
      if (stdout) options?.onOutput?.({ stream: "stdout", text: stdout });
      return { args, exitCode: 0, stdout, stderr: "" };
    },
  };
  const adapter: WorkspaceAgentAdapter = {
    repository: {
      input: {
        type: "repository",
        provider: "github",
        repository: "acme/widgets",
        revision: "main",
      },
      source: {
        provider: "github",
        async checkout(_input, directory) {
          await writeFile(`${directory}/README.md`, "widgets");
          return { revision: "abc123" };
        },
      },
    },
    capability: {
      id: "github.pull-requests",
      resources: [{ provider: "github", repository: "acme/widgets" }],
      createUpstream() {
        return {
          async listTools() {
            return [{ name: "github.create_pull_request" }];
          },
          async callTool() {
            return {};
          },
        };
      },
    },
  };
  const executor = createWorkspaceAgentsExecutor({
    cursor: cursorConfig,
    model: modelConfig,
    cursorImage: "sweat-agent-cursor:test",
    image: "sweat-agent:test",
    adapters: [adapter],
    createCapabilityEndpoint: () => ({
      url: "http://capabilities.example/mcp",
      close: async () => {},
    }),
    sandboxProvider: createAppleContainerSandboxProvider({
      container: createAppleContainerClient(runner),
      createId: () => "run-antboy",
    }),
  });

  const id = executor.startRun({
    task: "summarize the room",
    agentDefinitionId: ANTBOY_ID,
  });
  while (["preparing", "running"].includes(executor.getRun(id)?.state ?? "")) {
    await Bun.sleep(0);
  }

  const run = executor.getRun(id)!;
  expect(run.definition.id).toBe(ANTBOY_ID);
  expect(run.definition.runtime.kind).toBe("openai-agents");
  expect(run.definition.runtime.model?.model).toBe("test-model");
  expect(run.definition.runtime.image).toBe("sweat-agent:test");
  expect(run.inputs).toEqual([]);
  expect(run.capabilityGrant).toBeUndefined();
});

test("a repository-scoped capability cannot be configured without its repository", () => {
  expect(() =>
    createWorkspaceAgentsExecutor({
      model: modelConfig,
      cursor: cursorConfig,
      adapters: [
        {
          capability: {
            id: "github.pull-requests",
            resources: [{ provider: "github", repository: "acme/widgets" }],
            createUpstream: () => ({
              listTools: async () => [],
              callTool: async () => ({}),
            }),
          },
        },
      ],
      createCapabilityEndpoint: () => ({
        url: "http://capabilities.example/mcp",
        close: async () => {},
      }),
      sandboxProvider: createAppleContainerSandboxProvider({
        container: createAppleContainerClient({
          async run(args) {
            return { args, exitCode: 0, stdout: "", stderr: "" };
          },
        }),
      }),
    }),
  ).toThrow("requires its repository adapter");
});

test("antboy attachments become workspace inputs and an auditable task note", async () => {
  const bytes = new TextEncoder().encode("brief\n");
  const attachment = {
    type: "attachment" as const,
    id: "attachment-1",
    roomId: "room-1",
    filename: "brief.txt",
    byteSize: 6,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  const runner: CommandRunner = {
    async run(args, options): Promise<CommandResult> {
      const stdout =
        args[0] === "exec"
          ? `${JSON.stringify({ kind: "message", text: "done", at: 1 })}\n`
          : "";
      if (stdout) options?.onOutput?.({ stream: "stdout", text: stdout });
      return { args, exitCode: 0, stdout, stderr: "" };
    },
  };
  const executor = createWorkspaceAgentsExecutor({
    model: modelConfig,
    attachmentSource: {
      async read(id) {
        return id === attachment.id ? { ...attachment, bytes } : undefined;
      },
    },
    sandboxProvider: createAppleContainerSandboxProvider({
      container: createAppleContainerClient(runner),
      createId: () => "run-attachment",
    }),
  });

  const id = executor.startRun({
    task: "review the brief",
    agentDefinitionId: ANTBOY_ID,
    attachments: [attachment],
  });
  while (["preparing", "running"].includes(executor.getRun(id)?.state ?? ""))
    await Bun.sleep(0);

  expect(executor.getRun(id)?.inputs).toEqual([attachment]);
  expect(executor.getRun(id)?.task).toBe(
    "review the brief\n\nAttachments (inspect these paths before acting):\n- brief.txt: /work/.sweat/attachments/attachment-1/brief.txt",
  );
});

test("software-engineer start requires cursor; antboy start requires model", () => {
  const sandboxProvider = createAppleContainerSandboxProvider({
    container: createAppleContainerClient({
      async run(args) {
        return { args, exitCode: 0, stdout: "", stderr: "" };
      },
    }),
  });
  const cursorOnly = createWorkspaceAgentsExecutor({
    cursor: cursorConfig,
    sandboxProvider,
  });
  expect(() =>
    cursorOnly.startRun({
      task: "hi",
      agentDefinitionId: ANTBOY_ID,
    }),
  ).toThrow("LLM provider is not configured");

  const modelOnly = createWorkspaceAgentsExecutor({
    model: modelConfig,
    sandboxProvider,
  });
  expect(() =>
    modelOnly.startRun({
      task: "hi",
      agentDefinitionId: SOFTWARE_ENGINEER_ID,
    }),
  ).toThrow("Cursor agent runtime is not configured");
});
