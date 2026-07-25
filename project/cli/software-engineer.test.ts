import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("prints the error when the container runtime crashes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sweat-cli-"));
  const container = join(directory, "container");
  await writeFile(container, `#!/bin/sh
case "$1" in
  exec) echo "runtime exploded" >&2; exit 17 ;;
  *) exit 0 ;;
esac
`);
  await chmod(container, 0o755);

  try {
    const env = {
      ...Bun.env,
      PATH: `${directory}:${Bun.env.PATH}`,
      LLM_BASE_URL: "https://models.example/v1",
      LLM_API_KEY: "test-key",
      LLM_MODEL: "test-model",
    };
    delete env.LINEAR_MCP_API_KEY;
    const process = Bun.spawn(
      ["bun", "run", "cli/software-engineer.ts", "test task"],
      { cwd: join(import.meta.dir, ".."), env, stdout: "pipe", stderr: "pipe" },
    );
    const [exitCode, stderr] = await Promise.all([
      process.exited,
      new Response(process.stderr).text(),
    ]);

    expect(exitCode).toBe(1);
    expect(stderr).toContain("runtime exploded");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
