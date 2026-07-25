import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
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
      ["GET", "git/ref/heads%2Fmain"], ["GET", "git/commits/base-commit"], ["POST", "git/blobs"],
      ["POST", "git/trees"], ["POST", "git/commits"], ["POST", "git/refs"], ["POST", "pulls"],
    ]);
    expect(JSON.parse(requests[5].body!)).toEqual({ ref: "refs/heads/sweat/run-1", sha: "commit" });
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
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
