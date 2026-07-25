import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRepositoryWorkspaceProvisioner } from "./repository";

test("a repository input is checked out into a disposable workspace", async () => {
  const calls: unknown[] = [];
  let removed: string | undefined;
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [{
      provider: "github",
      checkout: async (input, directory) => {
        calls.push({ input, directory });
        await Bun.write(join(directory, "README.md"), "ready\n");
        return { revision: "abc123" };
      },
    }],
    createDirectory: async () => mkdtemp(join(tmpdir(), "sweat-run-")),
    removeDirectory: async (directory) => { removed = directory; await rm(directory, { force: true, recursive: true }); },
  });

  const prepared = await provisioner.prepare([{
    type: "repository", provider: "github", repository: "acme/product", revision: "main",
  }], { runId: "run-1" });

  expect(calls[0]).toMatchObject({
    input: { type: "repository", provider: "github", repository: "acme/product", revision: "main" },
  });
  expect(prepared.workspace?.git).toMatchObject({
    repository: "acme/product", baseRevision: "abc123", branch: "sweat/run-1",
  });
  await prepared.workspace?.dispose();
  expect(removed).toBe(prepared.workspace?.path);
});
