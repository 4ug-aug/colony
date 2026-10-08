import { expect, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { chmod, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Octokit } from "octokit";
import { STEP_TEXT_LIMIT } from "../runtime/step";
import {
  connectGitHubApp,
  createGitHubMcpGateway,
  listGitHubAppBranches,
  listGitHubAppRepositories,
} from "./github";

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

test("GitHub publishes committed HEAD under the assigned remote run branch", async () => {
  const workspace = await branchWithChange();
  await git(workspace.directory, ["branch", "--move", "oriant-198-poem-2"]);
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
      description: expect.stringContaining("committed HEAD"),
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
}, 10_000);

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
}, 10_000);

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

test("GitHub sends mode and type when syncing a deleted file", async () => {
  const workspace = await branchWithChange();
  await git(workspace.directory, ["rm", "--quiet", "README.md"]);
  await git(workspace.directory, ["commit", "--quiet", "--message", "Remove readme"]);
  const requests: Array<{ url: string; body?: string }> = [];
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string, init?: RequestInit) => {
          requests.push({ url, body: typeof init?.body === "string" ? init.body : undefined });
          if (url.includes("git/ref/heads%2Fsweat%2Frun-1")) return Response.json({ object: { sha: "run-commit" } });
          if (url.includes("git/commits/run-commit")) return Response.json({ tree: { sha: "old-tree" } });
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
    const tree = JSON.parse(requests.find(({ url }) => url.includes("git/trees"))!.body!).tree;
    expect(tree).toEqual([{ path: "README.md", mode: "100644", type: "blob", sha: null }]);
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
}, 10_000);

function feedbackGateway(overrides: { commentCount?: number; forbidden?: string[] } = {}) {
  const user = (login: string, type = "User") => ({ login, type });
  const routes: Record<string, unknown> = {
    "pulls/12/reviews": [
      { id: 1, user: user("alice"), state: "CHANGES_REQUESTED", body: "Please fix.", submitted_at: "2026-07-02T10:00:00Z" },
      { id: 2, user: user("bob"), state: "COMMENTED", body: "Old note.", submitted_at: "2026-06-01T10:00:00Z" },
      { id: 3, user: user("carol"), state: "PENDING", body: "draft", submitted_at: null },
    ],
    "pulls/12/comments": [
      { pull_request_review_id: 1, user: user("alice"), path: "src/a.ts", line: 7, body: "Rename this.", created_at: "2026-07-02T10:00:00Z", diff_hunk: "@@ -1,3 +1,3 @@\n a\n b\n+c" },
      { pull_request_review_id: 1, user: user("alice"), path: "src/b.ts", line: 3, body: "Handle null.", created_at: "2026-07-02T10:00:00Z", diff_hunk: "+x" },
      { pull_request_review_id: 2, user: user("bob"), path: "src/old.ts", line: 1, body: "Ancient comment.", created_at: "2026-06-01T10:00:00Z", diff_hunk: "+y" },
    ],
    "issues/12/comments": [
      { user: user("dave"), body: "Looks promising.", created_at: "2026-07-03T10:00:00Z" },
      { user: user("ci-bot[bot]", "Bot"), body: "Coverage dropped.", created_at: "2026-07-03T11:00:00Z" },
      { user: user("erin"), body: "Stale remark.", created_at: "2026-05-01T10:00:00Z" },
      ...Array.from({ length: overrides.commentCount ?? 0 }, () => (
        { user: user("frank"), body: "y".repeat(4000), created_at: "2026-07-04T10:00:00Z" }
      )),
    ],
    "commits/abcdef1234567/check-runs": { check_runs: [
      { id: 90, name: "lint", status: "completed", conclusion: "success", output: { title: "ok", summary: "fine" }, details_url: "https://ci.test/lint" },
      { id: 91, name: "unit", status: "completed", conclusion: "failure", output: { title: "2 tests failed", summary: "see annotations" }, details_url: "https://ci.test/unit" },
    ] },
    "check-runs/91/annotations": [
      { path: "src/a.test.ts", start_line: 12, message: "expected 1 got 2" },
      { path: "src/b.test.ts", start_line: 30, message: "boom" },
    ],
  };
  return createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string) => {
          if (url.endsWith("pulls/12")) return Response.json({ number: 12, title: "Add widget", head: { sha: "abcdef1234567" } });
          const key = Object.keys(routes).find((route) => new URL(url).pathname.endsWith(route));
          if (key && overrides.forbidden?.includes(key)) return Response.json({ message: "Resource not accessible by integration" }, { status: 403 });
          if (key) return Response.json(routes[key]);
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
}

const feedbackSession = (gateway: ReturnType<typeof feedbackGateway>) =>
  gateway.createSession({ tools: ["github.get_pull_request_feedback"], expiresAt: new Date(Date.now() + 60_000) });

const feedbackText = (result: unknown) => (result as { content: { text: string }[] }).content[0]!.text;

test("GitHub reads pull request feedback as compact text", async () => {
  const gateway = feedbackGateway();
  const text = feedbackText(await gateway.callTool(feedbackSession(gateway).token, "github.get_pull_request_feedback", { number: 12 }));

  expect(text).toContain("Pull request #12: Add widget");
  expect(text.match(/Review by alice/g)).toHaveLength(1);
  expect(text).toContain("Review by alice (CHANGES_REQUESTED, 2026-07-02T10:00:00Z):\nPlease fix.");
  expect(text).toContain("- src/a.ts:7 Rename this.");
  expect(text).toContain("- src/b.ts:3 Handle null.");
  expect(text.indexOf("Review by bob")).toBeLessThan(text.indexOf("Comments:"));
  expect(text).not.toContain("carol");
  expect(text).toContain("- dave (2026-07-03T10:00:00Z): Looks promising.");
  expect(text).toContain("- ci-bot[bot] (2026-07-03T11:00:00Z): Coverage dropped.");
  expect(text).toContain("Failed checks on abcdef1:");
  expect(text).toContain("- unit (failure): 2 tests failed");
  expect(text).toContain("  src/a.test.ts:12 expected 1 got 2");
  expect(text).toContain("  src/b.test.ts:30 boom");
  expect(text).toContain("https://ci.test/unit");
  expect(text).not.toContain("lint");
});

test("GitHub pull request feedback survives a missing Checks permission", async () => {
  const gateway = feedbackGateway({ forbidden: ["commits/abcdef1234567/check-runs"] });
  const text = feedbackText(await gateway.callTool(feedbackSession(gateway).token, "github.get_pull_request_feedback", { number: 12 }));
  expect(text).toContain("Review by alice");
  expect(text).toContain("- dave (2026-07-03T10:00:00Z): Looks promising.");
  expect(text.endsWith("Checks unavailable: the GitHub App needs the Checks: read permission.")).toBe(true);
});

test("GitHub pull request feedback lists a failed check when its annotations are forbidden", async () => {
  const gateway = feedbackGateway({ forbidden: ["check-runs/91/annotations"] });
  const text = feedbackText(await gateway.callTool(feedbackSession(gateway).token, "github.get_pull_request_feedback", { number: 12 }));
  expect(text).toContain("- unit (failure): 2 tests failed");
  expect(text).not.toContain("src/a.test.ts");
  expect(text).not.toContain("Checks unavailable");
});

test("GitHub pull request feedback drops items before since", async () => {
  const gateway = feedbackGateway();
  const text = feedbackText(await gateway.callTool(
    feedbackSession(gateway).token, "github.get_pull_request_feedback", { number: 12, since: "2026-06-15T00:00:00Z" },
  ));

  expect(text).toContain("Review by alice");
  expect(text).not.toContain("Review by bob");
  expect(text).not.toContain("Ancient comment");
  expect(text).not.toContain("Stale remark");
  expect(text).toContain("Looks promising.");
});

test("GitHub pull request feedback is bounded", async () => {
  const gateway = feedbackGateway({ commentCount: 20 });
  const text = feedbackText(await gateway.callTool(feedbackSession(gateway).token, "github.get_pull_request_feedback", { number: 12 }));

  expect(text.length).toBeLessThan(21_000);
  expect(text).toContain("[feedback trimmed]");
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

test("GitHub refuses to publish a HEAD outside the prepared history", async () => {
  const workspace = await branchWithChange();
  await git(workspace.directory, ["checkout", "--orphan", "unrelated"]);
  await Bun.write(join(workspace.directory, "README.md"), "unrelated\n");
  await git(workspace.directory, ["add", "README.md"]);
  await git(workspace.directory, ["commit", "--quiet", "--message", "Unrelated"]);
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
      .rejects.toThrow("must descend from the prepared base commit");
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

function readGateway(fetch: (url: string) => Promise<Response>) {
  return createGitHubMcpGateway({
    octokit: new Octokit({ auth: "secret", request: { fetch } }),
    repository: "acme/product",
    workspace: "/unused",
    branch: "sweat/run-1",
    baseCommit: "base",
    base: "main",
  });
}

test("GitHub compare lists changed files without a diff by default", async () => {
  const requests: string[] = [];
  const gateway = readGateway(async (url) => {
    requests.push(url);
    if (url.includes("/compare/")) {
      return Response.json({
        files: [
          { filename: "compose.yml", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b\n" },
          { filename: "gone.txt", status: "removed" },
        ],
      });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  });
  const session = gateway.createSession({
    tools: ["github.compare"], expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.callTool(session.token, "github.compare", {
    base: "main", head: "feat/col-66",
  })).resolves.toEqual({
    base: "main",
    head: "feat/col-66",
    files: [
      { path: "compose.yml", status: "M" },
      { path: "gone.txt", status: "D" },
    ],
  });
  expect(requests.some((url) => url.includes("compare/main...feat%2Fcol-66"))).toBe(true);
});

test("GitHub compare includes a truncated diff when asked", async () => {
  const patch = `${"x".repeat(STEP_TEXT_LIMIT + 50)}\n`;
  const gateway = readGateway(async (url) => {
    if (url.includes("/compare/")) {
      return Response.json({ files: [{ filename: "big.txt", status: "added", patch }] });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  });
  const session = gateway.createSession({
    tools: ["github.compare"], expiresAt: new Date(Date.now() + 60_000),
  });

  const result = await gateway.callTool(session.token, "github.compare", {
    base: "main", head: "feat/x", includeDiff: true,
  }) as { files: unknown[]; diff: string };
  expect(result.files).toEqual([{ path: "big.txt", status: "A" }]);
  expect(result.diff.endsWith("…[truncated]")).toBe(true);
  expect(result.diff.length).toBeLessThan(patch.length);
});

test("GitHub get_file returns decoded contents at a ref", async () => {
  const gateway = readGateway(async (url) => {
    if (url.includes("/contents/compose.yml") && url.includes("ref=feat%2Fcol-66")) {
      return Response.json({
        type: "file",
        encoding: "base64",
        path: "compose.yml",
        content: Buffer.from("loki:\n  image: grafana/loki\n").toString("base64"),
      });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  });
  const session = gateway.createSession({
    tools: ["github.get_file"], expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.callTool(session.token, "github.get_file", {
    path: "compose.yml", ref: "feat/col-66",
  })).resolves.toEqual({
    path: "compose.yml",
    ref: "feat/col-66",
    content: "loki:\n  image: grafana/loki\n",
  });
});

test("GitHub get_file lists a truncated directory", async () => {
  const gateway = readGateway(async (url) => {
    if (url.includes("/contents/monitoring")) {
      return Response.json([
        { type: "file", path: "monitoring/promtail.yml", name: "promtail.yml" },
        { type: "dir", path: "monitoring/rules", name: "rules" },
      ]);
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  });
  const session = gateway.createSession({
    tools: ["github.get_file"], expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.callTool(session.token, "github.get_file", {
    path: "monitoring", ref: "main",
  })).resolves.toEqual({
    type: "dir",
    path: "monitoring",
    ref: "main",
    entries: [
      { path: "monitoring/promtail.yml", type: "file" },
      { path: "monitoring/rules", type: "dir" },
    ],
  });
});

test("GitHub get_pull_request returns metadata and changed files without a patch", async () => {
  const gateway = readGateway(async (url) => {
    if (url.includes("/pulls/12/files")) {
      return Response.json([
        { filename: "compose.yml", status: "modified", patch: "secret-patch" },
      ]);
    }
    if (url.includes("/pulls/12")) {
      return Response.json({
        number: 12,
        title: "Ship Loki",
        body: "In-stack logs",
        state: "open",
        head: { ref: "feat/col-66", sha: "abc" },
        base: { ref: "main", sha: "def" },
      });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  });
  const session = gateway.createSession({
    tools: ["github.get_pull_request"], expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.callTool(session.token, "github.get_pull_request", { number: 12 }))
    .resolves.toEqual({
      number: 12,
      title: "Ship Loki",
      body: "In-stack logs",
      state: "open",
      head: { ref: "feat/col-66", sha: "abc" },
      base: { ref: "main", sha: "def" },
      files: [{ path: "compose.yml", status: "M" }],
    });
});

const privateKey = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
}).privateKey;

function fakeGitHub(options: { installed: boolean }) {
  const calls: string[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    // The paginator reads response.url, which a constructed Response leaves empty.
    const json = (body: unknown, status = 200) =>
      Object.defineProperty(
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
        "url",
        { value: url.href },
      );
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/app") return json({ slug: "colony-test" });
    if (url.pathname === "/repos/acme/widgets/installation")
      return options.installed ? json({ id: 42 }) : json({ message: "Not Found" }, 404);
    if (url.pathname === "/app/installations/42/access_tokens")
      return json({ token: "ghs_test", expires_at: new Date(Date.now() + 3_600_000).toISOString() }, 201);
    if (url.pathname === "/repos/acme/widgets/branches/main") return json({ name: "main" });
    if (url.pathname === "/app/installations") return json([{ id: 42 }]);
    if (url.pathname === "/installation/repositories")
      return json({
        total_count: 2,
        repositories: [
          { full_name: "acme/widgets", default_branch: "main" },
          { full_name: "acme/api", default_branch: "trunk" },
        ],
      });
    if (url.pathname === "/repos/acme/widgets/branches")
      return json([{ name: "main" }, { name: "develop" }]);
    return json({ message: "Not Found" }, 404);
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

test("connectGitHubApp resolves the installation and checks the base branch", async () => {
  const github = fakeGitHub({ installed: true });
  expect(
    await connectGitHubApp({ appId: "1", privateKey, repository: "acme/widgets", base: "main", fetch: github.fetch }),
  ).toEqual({ slug: "colony-test", installationId: 42 });
  expect(github.calls).toContain("GET /repos/acme/widgets/branches/main");
  await expect(
    connectGitHubApp({ appId: "1", privateKey, repository: "acme/widgets", base: "develop", fetch: github.fetch }),
  ).rejects.toThrow("Branch develop doesn't exist in acme/widgets");
});

test("connectGitHubApp points to the install page when the App is not installed", async () => {
  await expect(
    connectGitHubApp({
      appId: "1",
      privateKey,
      repository: "acme/widgets",
      base: "main",
      fetch: fakeGitHub({ installed: false }).fetch,
    }),
  ).rejects.toThrow(
    "GitHub App isn't installed on acme/widgets. Install it: https://github.com/apps/colony-test/installations/new",
  );
});

test("listGitHubAppRepositories lists every installation's repositories, sorted", async () => {
  expect(
    await listGitHubAppRepositories({ appId: "1", privateKey, fetch: fakeGitHub({ installed: true }).fetch }),
  ).toEqual([
    { fullName: "acme/api", defaultBranch: "trunk" },
    { fullName: "acme/widgets", defaultBranch: "main" },
  ]);
});

test("listGitHubAppBranches lists the repository's branches", async () => {
  expect(
    await listGitHubAppBranches({
      appId: "1",
      privateKey,
      repository: "acme/widgets",
      fetch: fakeGitHub({ installed: true }).fetch,
    }),
  ).toEqual(["main", "develop"]);
});

/** A tarball of one file, the way GitHub serves a commit's contents. */
async function tarballOf(files: Record<string, string>): Promise<Uint8Array> {
  const root = await mkdtemp(join(tmpdir(), "sweat-pr-tarball-"));
  const inner = join(root, "acme-product-sha");
  for (const [path, content] of Object.entries(files)) await Bun.write(join(inner, path), content);
  const archive = join(root, "archive.tar.gz");
  const tar = Bun.spawn(["tar", "-czf", archive, "-C", root, "acme-product-sha"]);
  await tar.exited;
  const bytes = new Uint8Array(await Bun.file(archive).arrayBuffer());
  await rm(root, { force: true, recursive: true });
  return bytes;
}

const gzip = (bytes: Uint8Array) =>
  new Response(bytes, { headers: { "content-type": "application/x-gzip" } });

function pullRequestGateway(options: {
  workspace: string;
  baseCommit: string;
  route: (url: string, method: string, body?: string) => Response | Promise<Response>;
}) {
  const requests: Array<{ url: string; method: string; body?: string }> = [];
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string, init?: RequestInit) => {
          const method = init?.method ?? "GET";
          const body = typeof init?.body === "string" ? init.body : undefined;
          requests.push({ url: url.replace("https://api.github.com/repos/acme/product/", ""), method, body });
          return options.route(url, method, body);
        },
      },
    }),
    repository: "acme/product",
    workspace: options.workspace,
    branch: "sweat/run-1",
    baseCommit: options.baseCommit,
    base: "main",
  });
  const session = gateway.createSession({
    tools: [
      "github.checkout_pull_request",
      "github.push_to_pull_request",
      "github.comment_on_pull_request",
      "github.review_pull_request",
    ],
    expiresAt: new Date(Date.now() + 60_000),
  });
  const call = (name: string, args: Record<string, unknown>) => gateway.callTool(session.token, name, args);
  return { requests, call };
}

const openPullRequest = (head: { sha: string; repo?: string }) =>
  Response.json({
    number: 7,
    state: "open",
    html_url: "https://example.test/pull/7",
    head: { ref: "feat/quarantine", sha: head.sha, repo: { full_name: head.repo ?? "acme/product" } },
  });

test("GitHub checks out a pull request's head and pushes new commits onto its branch", async () => {
  const workspace = await branchWithChange();
  const tarball = await tarballOf({ "README.md": "pull request version\n" });
  const { requests, call } = pullRequestGateway({
    ...workspace,
    workspace: workspace.directory,
    route: (url, method) => {
      if (url.endsWith("/pulls/7")) return openPullRequest({ sha: "pr-head" });
      if (url.includes("/tarball/pr-head")) return gzip(tarball);
      if (url.endsWith("/git/commits/pr-head")) return Response.json({ tree: { sha: "pr-tree" } });
      if (method === "POST" && url.endsWith("/git/blobs")) return Response.json({ sha: "blob" });
      if (method === "POST" && url.endsWith("/git/trees")) return Response.json({ sha: "fixed-tree" });
      if (method === "POST" && url.endsWith("/git/commits")) return Response.json({ sha: "fixed-head" });
      if (method === "PATCH") return Response.json({});
      throw new Error(`Unexpected GitHub request: ${method} ${url}`);
    },
  });

  try {
    await expect(call("github.checkout_pull_request", { number: 7 })).resolves.toEqual({
      content: [{ type: "text", text: expect.stringContaining("Checked out pull request #7 (feat/quarantine") }],
    });
    expect(await Bun.file(join(workspace.directory, "README.md")).text()).toBe("pull request version\n");

    await Bun.write(join(workspace.directory, "README.md"), "reviewed and fixed\n");
    await git(workspace.directory, ["commit", "--quiet", "--all", "--message", "Fix review findings"]);
    await expect(call("github.push_to_pull_request", { number: 7 })).resolves.toEqual({
      content: [{ type: "text", text: "Pushed 1 commit to pull request #7 (feat/quarantine): https://example.test/pull/7" }],
    });

    const commit = requests.find(({ method, url }) => method === "POST" && url === "git/commits")!;
    expect(JSON.parse(commit.body!)).toMatchObject({
      message: "Fix review findings",
      parents: ["pr-head"],
      tree: "fixed-tree",
    });
    const update = requests.find(({ method }) => method === "PATCH")!;
    expect(update.url).toBe("git/refs/heads%2Ffeat%2Fquarantine");
    expect(JSON.parse(update.body!)).toEqual({ sha: "fixed-head", force: false });
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
}, 10_000);

test("GitHub refuses pull request pushes it cannot make safely", async () => {
  const workspace = await branchWithChange();
  const tarball = await tarballOf({ "README.md": "pull request version\n" });
  let head = "pr-head";
  let repo = "acme/product";
  const { call } = pullRequestGateway({
    ...workspace,
    workspace: workspace.directory,
    route: (url) => {
      if (url.endsWith("/pulls/7")) return openPullRequest({ sha: head, repo });
      if (url.includes("/tarball/")) return gzip(tarball);
      throw new Error(`Unexpected GitHub request: ${url}`);
    },
  });

  try {
    await expect(call("github.push_to_pull_request", { number: 7 })).rejects.toThrow(
      "Check out pull request #7 with github.checkout_pull_request first",
    );
    repo = "someone/fork";
    await expect(call("github.checkout_pull_request", { number: 7 })).rejects.toThrow(
      "Pull request #7 comes from someone/fork",
    );
    repo = "acme/product";
    await call("github.checkout_pull_request", { number: 7 });
    await Bun.write(join(workspace.directory, "README.md"), "fixed\n");
    await git(workspace.directory, ["commit", "--quiet", "--all", "--message", "Fix"]);
    head = "someone-else-pushed";
    await expect(call("github.push_to_pull_request", { number: 7 })).rejects.toThrow(
      "Pull request #7 moved since checkout",
    );
  } finally {
    await rm(workspace.directory, { force: true, recursive: true });
  }
}, 10_000);

test("GitHub comments on and reviews a pull request", async () => {
  const { requests, call } = pullRequestGateway({
    workspace: "/unused",
    baseCommit: "base",
    route: (url, method) => {
      if (url.endsWith("/pulls/7")) return openPullRequest({ sha: "pr-head" });
      if (method === "POST" && url.endsWith("/issues/7/comments"))
        return Response.json({ html_url: "https://example.test/pull/7#comment" });
      if (method === "POST" && url.endsWith("/pulls/7/reviews"))
        return Response.json({ html_url: "https://example.test/pull/7#review" });
      throw new Error(`Unexpected GitHub request: ${method} ${url}`);
    },
  });

  await expect(call("github.comment_on_pull_request", { number: 7, body: "Looks close." })).resolves.toEqual({
    content: [{ type: "text", text: "Commented on pull request #7: https://example.test/pull/7#comment" }],
  });
  await expect(
    call("github.review_pull_request", {
      number: 7,
      event: "REQUEST_CHANGES",
      body: "Two issues.",
      comments: [{ path: "src/app.ts", line: 12, body: "Off by one." }],
    }),
  ).resolves.toEqual({
    content: [{ type: "text", text: "Requested changes on pull request #7: https://example.test/pull/7#review" }],
  });
  await expect(call("github.review_pull_request", { number: 7, event: "MERGE", body: "x" })).rejects.toThrow(
    "event must be COMMENT, APPROVE, or REQUEST_CHANGES",
  );

  expect(JSON.parse(requests.find(({ url }) => url === "issues/7/comments")!.body!)).toEqual({ body: "Looks close." });
  expect(JSON.parse(requests.find(({ url }) => url === "pulls/7/reviews")!.body!)).toEqual({
    commit_id: "pr-head",
    event: "REQUEST_CHANGES",
    body: "Two issues.",
    comments: [{ path: "src/app.ts", line: 12, body: "Off by one." }],
  });
});
