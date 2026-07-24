import { expect, test } from "bun:test";
import { createLightAgentRunner } from "../composition/light-agent";

const liveTest = Bun.env.RUN_CONTAINER_E2E === "1" ? test : test.skip;

liveTest("a light agent runs in a native Apple container", async () => {
  const runner = createLightAgentRunner();

  const result = await runner.run({
    sandbox: { image: "alpine:latest" },
    prompt: "hello",
  });

  expect(result).toEqual({
    exitCode: 0,
    stdout: "light-agent: hello\n",
    stderr: "",
  });
});
