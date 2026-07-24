import { describe, expect, test } from "bun:test";
import {
  ContainerCommandError,
  createAppleContainerClient,
  type CommandOptions,
  type CommandResult,
  type CommandRunner,
} from "../src";

class FakeRunner implements CommandRunner {
  readonly calls: Array<{
    args: readonly string[];
    options?: CommandOptions;
  }> = [];

  constructor(private readonly results: CommandResult[] = []) {}

  async run(
    args: readonly string[],
    options?: CommandOptions,
  ): Promise<CommandResult> {
    this.calls.push({ args, options });
    return (
      this.results.shift() ?? { args, exitCode: 0, stdout: "", stderr: "" }
    );
  }
}

describe("Apple container SDK", () => {
  test("composes operations over an injected command protocol", async () => {
    const runner = new FakeRunner();
    const sdk = createAppleContainerClient(runner);

    await sdk.containers.run("nginx:alpine", {
      name: "web",
      detach: true,
      remove: true,
      env: { NODE_ENV: "test" },
      publish: ["127.0.0.1:8080:80"],
    });

    expect(runner.calls[0]).toEqual({
      args: [
        "run",
        "--env",
        "NODE_ENV=test",
        "--name",
        "web",
        "--detach",
        "--rm",
        "--publish",
        "127.0.0.1:8080:80",
        "nginx:alpine",
      ],
      options: { stdio: "capture" },
    });
  });

  test("parses structured CLI output", async () => {
    const runner = new FakeRunner([
      {
        args: [],
        exitCode: 0,
        stdout: '[{"id":"web","state":"running"}]',
        stderr: "",
      },
    ]);

    const containers = await createAppleContainerClient(runner).containers.list<{
      id: string;
      state: string;
    }>();

    expect(containers).toEqual([{ id: "web", state: "running" }]);
  });

  test("turns non-zero exits into a typed error", async () => {
    const runner = new FakeRunner([
      {
        args: ["system", "stop"],
        exitCode: 1,
        stdout: "",
        stderr: "not running",
      },
    ]);

    expect(
      createAppleContainerClient(runner).system.stop(),
    ).rejects.toBeInstanceOf(ContainerCommandError);
  });

  test("redacts environment secrets from container errors", async () => {
    const runner: CommandRunner = {
      async run(args): Promise<CommandResult> {
        return { args, exitCode: 1, stdout: "", stderr: "failed" };
      },
    };

    await expect(
      createAppleContainerClient(runner).containers.exec(
        "sandbox-1",
        ["echo", "hello"],
        { env: { SWEAT_MODEL_API_KEY: "secret" } },
      ),
    ).rejects.toThrow("SWEAT_MODEL_API_KEY=[redacted]");
  });
});
