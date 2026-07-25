import { expect, test } from "bun:test";
import { createAgentRunner } from "./index";

test("an agent runs inside a sandbox", async () => {
  const sandbox = {
    id: "sandbox-1",
    exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
    dispose: async () => {},
  };
  const runner = createAgentRunner({
    sandboxes: { create: async () => sandbox },
    agent: {
      run: async () => ({
        exitCode: 0,
        stdout: "task complete",
        stderr: "",
      }),
    },
  });

  const result = await runner.run({
    sandbox: { image: "agent:latest" },
    prompt: "Fix the tests",
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "task complete",
    stderr: "",
  });
});

test("the sandbox is disposed when the agent fails", async () => {
  let disposed = false;
  const runner = createAgentRunner({
    sandboxes: {
      create: async () => ({
        id: "sandbox-1",
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
        dispose: async () => {
          disposed = true;
        },
      }),
    },
    agent: {
      run: async () => {
        throw new Error("agent failed");
      },
    },
  });

  await expect(
    runner.run({
      sandbox: { image: "agent:latest" },
      prompt: "Fix the tests",
    }),
  ).rejects.toThrow("agent failed");
  expect(disposed).toBe(true);
});

test("a prepared repository is mounted as the agent workspace", async () => {
  let spec: unknown;
  let workspace: string | undefined;
  let disposed = false;
  const runner = createAgentRunner({
    sandboxes: { create: async (value) => {
      spec = value;
      return { id: "sandbox-1", exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }), dispose: async () => {} };
    } },
    agent: { run: async (_sandbox, request) => {
      workspace = request.workspace;
      return { exitCode: 0, stdout: "", stderr: "" };
    } },
    inputs: { prepare: async () => ({ workspace: { path: "/tmp/sweat-run-1", dispose: async () => { disposed = true; } } }) },
  });

  await runner.run({
    sandbox: { image: "agent:latest" }, prompt: "Fix the tests",
    inputs: [{ type: "repository", provider: "github", repository: "acme/product", revision: "main" }],
  });

  expect(spec).toEqual({ image: "agent:latest", volumes: ["/tmp/sweat-run-1:/work"] });
  expect(workspace).toBe("/work");
  expect(disposed).toBe(true);
});
