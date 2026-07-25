import { expect, test } from "bun:test";
import { createLightAgentExecutor } from "../composition/light-agent";
import { createAppleContainerSandboxProvider } from "../providers/apple-container-sandbox";
import { createAppleContainerClient } from "../sdk/src";

const liveTest = Bun.env.RUN_CONTAINER_E2E === "1" ? test : test.skip;

liveTest("a light agent runs in a native Apple container", async () => {
  const executor = createLightAgentExecutor();

  const id = executor.startRun({ agentDefinitionId: "light-agent", task: "hello" });
  let result;
  while ((result = executor.getRun(id)) && ["preparing", "running"].includes(result.state)) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  expect(result).toEqual({
    id,
    state: "succeeded",
    task: "hello",
    definition: expect.any(Object),
    inputs: [],
    effectiveLimits: { maxDurationMs: 30 * 60 * 1000, maxOutputBytes: 1024 * 1024 },
    stdout: "light-agent: hello\n",
    stderr: "",
    exitCode: 0,
    createdAt: expect.any(Number),
    startedAt: expect.any(Number),
    completedAt: expect.any(Number),
  });
});

liveTest("the agent image includes Git", async () => {
  const sandboxes = createAppleContainerSandboxProvider({
    container: createAppleContainerClient(),
  });
  const sandbox = await sandboxes.create({ image: "sweat-agent:latest" });

  try {
    const result = await sandbox.exec({ command: ["git", "--version"] });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toStartWith("git version ");
  } finally {
    await sandbox.dispose();
  }
});
