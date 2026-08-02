import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import {
  createAppleContainerClient,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from "../sdk/src";
import {
  createSoftwareEngineerExecutor,
  type SoftwareEngineerAdapter,
} from "./software-engineer";

test("a configured adapter binds its repository and capabilities to every run", async () => {
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
  const adapter: SoftwareEngineerAdapter = {
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
  let configuredModel = {
    baseUrl: "https://models.example/v1",
    apiKey: "test-key",
    model: "test-model",
  };
  const executor = createSoftwareEngineerExecutor({
    model: () => configuredModel,
    adapters: [adapter],
    createCapabilityEndpoint: () => ({
      url: "http://capabilities.example/mcp",
      close: async () => {},
    }),
    container: createAppleContainerClient(runner),
    createId: () => "run-1",
  });

  const id = executor.startRun({ task: "fix the issue" });
  configuredModel = { ...configuredModel, model: "changed-after-start" };
  while (["preparing", "running"].includes(executor.getRun(id)?.state ?? "")) {
    await Bun.sleep(0);
  }

  const run = executor.getRun(id)!;
  const containerRun = calls.find(({ args }) => args[0] === "run")!;
  const containerExec = calls.find(({ args }) => args[0] === "exec")!;
  expect(run.inputs).toEqual([adapter.repository!.input]);
  expect(run.definition.runtime.model?.model).toBe("test-model");
  expect(run.capabilityGrant?.tools).toEqual([
    "github.create_pull_request",
    "github.wait_for_pull_request_checks",
  ]);
  expect(run.capabilityGrant?.resources).toEqual([
    { provider: "github", repository: "acme/widgets" },
  ]);
  expect(preparedRepository).toBe("acme/widgets");
  expect(containerRun.args.some((arg) => arg.endsWith(":/work"))).toBe(true);
  expect(containerExec.args).toContain("/work");
});

test("a repository-scoped capability cannot be configured without its repository", () => {
  expect(() =>
    createSoftwareEngineerExecutor({
      model: () => ({
        baseUrl: "https://models.example/v1",
        apiKey: "test-key",
        model: "test-model",
      }),
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
    }),
  ).toThrow("requires its repository adapter");
});

test("request attachments become workspace inputs and an auditable task note", async () => {
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
  const executor = createSoftwareEngineerExecutor({
    model: () => ({
      baseUrl: "https://models.example/v1",
      apiKey: "test-key",
      model: "test-model",
    }),
    attachmentSource: {
      async read(id) {
        return id === attachment.id ? { ...attachment, bytes } : undefined;
      },
    },
    container: createAppleContainerClient(runner),
    createId: () => "run-attachment",
  });

  const id = executor.startRun({
    task: "review the brief",
    attachments: [attachment],
  });
  while (["preparing", "running"].includes(executor.getRun(id)?.state ?? ""))
    await Bun.sleep(0);

  expect(executor.getRun(id)?.inputs).toEqual([attachment]);
  expect(executor.getRun(id)?.task).toBe(
    "review the brief\n\nAttachments (inspect these paths before acting):\n- brief.txt: /work/.sweat/attachments/attachment-1/brief.txt",
  );
});
