import { expect, test } from "bun:test";
import { createRepositoryWorkspaceProvisioner } from "./repository";

test("a repository input is checked out into a disposable workspace", async () => {
  const calls: unknown[] = [];
  let removed: string | undefined;
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [{
      provider: "github",
      checkout: async (input, directory) => { calls.push({ input, directory }); },
    }],
    createDirectory: async () => "/tmp/sweat-run-1",
    removeDirectory: async (directory) => { removed = directory; },
  });

  const prepared = await provisioner.prepare([{
    type: "repository", provider: "github", repository: "acme/product", revision: "main",
  }]);

  expect(calls).toEqual([{
    input: { type: "repository", provider: "github", repository: "acme/product", revision: "main" },
    directory: "/tmp/sweat-run-1",
  }]);
  await prepared.workspace?.dispose();
  expect(removed).toBe("/tmp/sweat-run-1");
});
