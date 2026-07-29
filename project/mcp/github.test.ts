import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Octokit } from "octokit";
import { createGitHubMcpGateway } from "./github";

async function git(directory: string, args: readonly string[]): Promise<string> {
  const process = Bun.spawn(["git", "-C", directory, ...args], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode) throw new Error(stderr);
  return stdout;
}

async function branchWithChange(): Promise<{ directory: string; baseCommit: string }> {
  const directory = await mkdtemp(join(tmpdir(), "sweat-github-test-"));
  await Bun.write(join(directory, "README.md"), "before\n");
  await git(directory, ["init", "--initial-branch", "sweat/run-1"]);
  await git(directory, ["config", "user.name", "Test"]);
  await git(directory, ["config", "user.email", "test@example.com"]);
  await git(directory, ["config", "commit.gpgsign", "false"]);
  await git(directory, ["add", "README.md"]);
  await git(directory, ["commit", "--quiet", "--message", "Base"]);
  const baseCommit = (await git(directory, ["rev-parse", "HEAD"])).trim();
  await Bun.write(join(directory, "README.md"), "after\n");
  await git(directory, ["add", "README.md"]);
  await git(directory, ["commit", "--quiet", "--message", "Change"]);
  return { directory, baseCommit };
}

test("GitHub publishes only the committed run branch", async () => {
  const workspace = await branchWithChange();
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  const responses = [
    { object: { sha: "base-commit" } }, { tree: { sha: "base-tree" } },
    { sha: "blob" }, { sha: "tree" }, { sha: "commit" }, {}, { number: 12 },
  ];
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string, init?: RequestInit) => {
          requests.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
          if (url.includes("git/ref/heads%2Fsweat%2Frun-1")) {
            return Response.json({ message: "Not Found" }, { status: 404 });
          }
          return Response.json(responses.shift());
        },
      },
    }),
    repository: "acme/product",
    workspace: workspace.directory,
    branch: "sweat/run-1",
    baseCommit: workspace.baseCommit,
    base: "main",
    now: () => new Date("2026-07-24T12:00:00Z"),
  });
  const session = gateway.createSession({
    tools: ["github.create_pull_request"], expiresAt: new Date("2026-07-24T12:05:00Z"),
  });

  try {
    await expect(gateway.listTools(session.token)).resolves.toMatchObject([{
      name: "github.create_pull_request",
      description: expect.stringContaining("Publish this run's committed branch"),
    }]);
    await expect(gateway.callTool(session.token, "github.create_pull_request", {
      title: "Change", body: "Done",
    })).resolves.toEqual({ number: 12 });

    expect(requests.map(({ url, method }) => [method ?? "GET", url.replace("https://api.github.com/repos/acme/product/", "")])).toEqual([
      ["GET", "git/ref/heads%2Fsweat%2Frun-1"], ["GET", "git/ref/heads%2Fmain"],
      ["GET", "git/commits/base-commit"], ["POST", "git/blobs"], ["POST", "git/trees"],
      ["POST", "git/commits"], ["POST", "git/refs"], ["POST", "pulls"],
    ]);
    expect(JSON.parse(requests[6].body!)).toEqual({ ref: "refs/heads/sweat/run-1", sha: "commit" });
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
});

test("GitHub returns the existing pull request when publishing is retried", async () => {
  const workspace = await branchWithChange();
  const expectedTree = (await git(workspace.directory, ["rev-parse", "HEAD^{tree}"])).trim();
  const requests: Array<{ url: string; method?: string }> = [];
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string, init?: RequestInit) => {
          requests.push({ url, method: init?.method });
          if (url.includes("git/ref/heads%2Fsweat%2Frun-1")) return Response.json({ object: { sha: "run-commit" } });
          if (url.includes("git/commits/run-commit")) return Response.json({ tree: { sha: expectedTree } });
          if (url.includes("pulls?")) return Response.json([{ number: 12, html_url: "https://example.test/pr/12" }]);
          throw new Error(`Unexpected GitHub request: ${url}`);
        },
      },
    }),
    repository: "acme/product",
    workspace: workspace.directory,
    branch: "sweat/run-1",
    baseCommit: workspace.baseCommit,
    base: "main",
  });
  const session = gateway.createSession({
    tools: ["github.create_pull_request"], expiresAt: new Date(Date.now() + 60_000),
  });

  try {
    await expect(gateway.callTool(session.token, "github.create_pull_request", { title: "Change" }))
      .resolves.toEqual({ number: 12, html_url: "https://example.test/pr/12" });
    await expect(gateway.callTool(session.token, "github.create_pull_request", { title: "Change" }))
      .resolves.toEqual({ number: 12, html_url: "https://example.test/pr/12" });
    expect(requests.filter(({ method }) => method === "POST")).toHaveLength(0);
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
});

test("GitHub syncs an existing run branch before returning its pull request", async () => {
  const workspace = await branchWithChange();
  const requests: Array<{ url: string; method?: string; body?: string }> = [];
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string, init?: RequestInit) => {
          requests.push({ url, method: init?.method, body: typeof init?.body === "string" ? init.body : undefined });
          if (url.includes("git/ref/heads%2Fsweat%2Frun-1")) return Response.json({ object: { sha: "run-commit" } });
          if (url.includes("git/commits/run-commit")) return Response.json({ tree: { sha: "old-tree" } });
          if (url.includes("git/blobs")) return Response.json({ sha: "blob" });
          if (url.includes("git/trees")) return Response.json({ sha: "new-tree" });
          if (url.includes("git/commits")) return Response.json({ sha: "synced-commit" });
          if (url.includes("git/refs/heads%2Fsweat%2Frun-1")) return Response.json({});
          if (url.includes("pulls?")) return Response.json([{ number: 12 }]);
          throw new Error(`Unexpected GitHub request: ${url}`);
        },
      },
    }),
    repository: "acme/product",
    workspace: workspace.directory,
    branch: "sweat/run-1",
    baseCommit: workspace.baseCommit,
    base: "main",
  });
  const session = gateway.createSession({
    tools: ["github.create_pull_request"], expiresAt: new Date(Date.now() + 60_000),
  });

  try {
    await expect(gateway.callTool(session.token, "github.create_pull_request", { title: "Change" }))
      .resolves.toEqual({ number: 12 });
    const update = requests.find(({ method }) => method === "PATCH");
    expect(update?.url).toContain("git/refs/heads%2Fsweat%2Frun-1");
    expect(JSON.parse(update!.body!)).toEqual({ sha: "synced-commit", force: false });
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
});

test("GitHub preserves binary data, executable modes, and symlinks when syncing", async () => {
  const workspace = await branchWithChange();
  await Bun.write(join(workspace.directory, "image.bin"), new Uint8Array([0, 255, 128, 10]));
  await Bun.write(join(workspace.directory, "script.sh"), "#!/bin/sh\necho hi\n");
  await chmod(join(workspace.directory, "script.sh"), 0o755);
  await symlink("README.md", join(workspace.directory, "readme-link"));
  await git(workspace.directory, ["add", "image.bin", "script.sh", "readme-link"]);
  await git(workspace.directory, ["commit", "--quiet", "--message", "Add special files"]);
  const requests: Array<{ url: string; body?: string }> = [];
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string, init?: RequestInit) => {
          requests.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
          if (url.includes("git/ref/heads%2Fsweat%2Frun-1")) return Response.json({ object: { sha: "run-commit" } });
          if (url.includes("git/commits/run-commit")) return Response.json({ tree: { sha: "old-tree" } });
          if (url.includes("git/blobs")) return Response.json({ sha: `blob-${requests.length}` });
          if (url.includes("git/trees")) return Response.json({ sha: "new-tree" });
          if (url.includes("git/commits")) return Response.json({ sha: "synced-commit" });
          if (url.includes("git/refs/heads%2Fsweat%2Frun-1")) return Response.json({});
          if (url.includes("pulls?")) return Response.json([{ number: 12 }]);
          throw new Error(`Unexpected GitHub request: ${url}`);
        },
      },
    }),
    repository: "acme/product",
    workspace: workspace.directory,
    branch: "sweat/run-1",
    baseCommit: workspace.baseCommit,
    base: "main",
  });
  const session = gateway.createSession({
    tools: ["github.create_pull_request"], expiresAt: new Date(Date.now() + 60_000),
  });

  try {
    await expect(gateway.callTool(session.token, "github.create_pull_request", { title: "Change" })).resolves.toEqual({ number: 12 });
    const blobs = requests.filter(({ url }) => url.includes("git/blobs")).map(({ body }) => JSON.parse(body!));
    expect(blobs).toEqual(expect.arrayContaining([
      { content: "AP+ACg==", encoding: "base64" },
      { content: Buffer.from("README.md").toString("base64"), encoding: "base64" },
    ]));
    const tree = JSON.parse(requests.find(({ url }) => url.includes("git/trees"))!.body!).tree;
    expect(tree).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "image.bin", mode: "100644", type: "blob" }),
      expect.objectContaining({ path: "script.sh", mode: "100755", type: "blob" }),
      expect.objectContaining({ path: "readme-link", mode: "120000", type: "blob" }),
    ]));
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
}, 10_000);

test("GitHub returns failed pull request checks", async () => {
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string) => {
          if (url.includes("pulls/12")) return Response.json({ head: { sha: "run-commit" } });
          if (url.includes("commits/run-commit/check-runs")) {
            return Response.json({ check_runs: [{
              name: "test", status: "completed", conclusion: "failure", details_url: "https://example.test/check/1",
            }] });
          }
          throw new Error(`Unexpected GitHub request: ${url}`);
        },
      },
    }),
    repository: "acme/product",
    workspace: "/unused",
    branch: "sweat/run-1",
    baseCommit: "base",
    base: "main",
  });
  const session = gateway.createSession({
    tools: ["github.wait_for_pull_request_checks"], expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.callTool(session.token, "github.wait_for_pull_request_checks", { number: 12 }))
    .resolves.toEqual({
      state: "failed",
      checks: [{
        name: "test", status: "completed", conclusion: "failure", detailsUrl: "https://example.test/check/1",
      }],
    });
});

test("GitHub refuses to publish uncommitted workspace edits", async () => {
  const workspace = await branchWithChange();
  await Bun.write(join(workspace.directory, "README.md"), "dirty\n");
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({ auth: "secret" }),
    repository: "acme/product",
    workspace: workspace.directory,
    branch: "sweat/run-1",
    baseCommit: workspace.baseCommit,
    base: "main",
  });
  const session = gateway.createSession({
    tools: ["github.create_pull_request"], expiresAt: new Date(Date.now() + 60_000),
  });

  try {
    await expect(gateway.callTool(session.token, "github.create_pull_request", { title: "Change" }))
      .rejects.toThrow("Commit workspace changes");
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
});

test("GitHub refuses to publish when verification fails", async () => {
  const workspace = await branchWithChange();
  const requests: unknown[] = [];
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: { fetch: async (...args) => {
        requests.push(args);
        throw new Error("GitHub must not be called");
      } },
    }),
    repository: "acme/product",
    workspace: workspace.directory,
    branch: "sweat/run-1",
    baseCommit: workspace.baseCommit,
    base: "main",
    verify: async () => { throw new Error("Verification failed with code 1"); },
  });
  const session = gateway.createSession({
    tools: ["github.create_pull_request"], expiresAt: new Date(Date.now() + 60_000),
  });

  try {
    await expect(gateway.callTool(session.token, "github.create_pull_request", { title: "Change" }))
      .rejects.toThrow("Verification failed with code 1");
    expect(requests).toEqual([]);
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
});

test("GitHub validates pull request arguments before publishing", async () => {
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({ auth: "secret" }),
    repository: "acme/product",
    workspace: "/unused",
    branch: "sweat/run-1",
    baseCommit: "base",
    base: "main",
  });
  const session = gateway.createSession({
    tools: ["github.create_pull_request"], expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.callTool(session.token, "github.create_pull_request", {}))
    .rejects.toThrow("GitHub pull request title is required");
});
