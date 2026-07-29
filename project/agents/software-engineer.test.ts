import { expect, test } from "bun:test";
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
  const executor = createSoftwareEngineerExecutor({
    model: {
      baseUrl: "https://models.example/v1",
      apiKey: "test-key",
      model: "test-model",
    },
    adapters: [adapter],
    createCapabilityEndpoint: () => ({
      url: "http://capabilities.example/mcp",
      close: async () => {},
    }),
    container: createAppleContainerClient(runner),
    createId: () => "run-1",
  });

  const id = executor.startRun({ task: "fix the issue" });
  while (["preparing", "running"].includes(executor.getRun(id)?.state ?? "")) {
    await Bun.sleep(0);
  }

  const run = executor.getRun(id)!;
  const containerRun = calls.find(({ args }) => args[0] === "run")!;
  const containerExec = calls.find(({ args }) => args[0] === "exec")!;
  expect(run.inputs).toEqual([adapter.repository!.input]);
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
      model: {
        baseUrl: "https://models.example/v1",
        apiKey: "test-key",
        model: "test-model",
      },
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
