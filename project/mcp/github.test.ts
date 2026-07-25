import { expect, test } from "bun:test";
import { Octokit } from "octokit";
import { createGitHubMcpGateway } from "./github";

test("GitHub PR writes stay scoped to the granted repository", async () => {
  const gateway = createGitHubMcpGateway({
    octokit: new Octokit({ auth: "secret" }),
    repository: "acme/product",
    now: () => new Date("2026-07-24T12:00:00Z"),
  });
  const session = gateway.createSession({
    tools: ["github.createPullRequest"],
    expiresAt: new Date("2026-07-24T12:05:00Z"),
  });

  await expect(gateway.callTool(session.token, "github.createPullRequest", {
    repository: "other/product", base: "main", branch: "agent/change", title: "Change",
    message: "Change", files: [{ path: "README.md", content: "updated" }],
  })).rejects.toThrow("GitHub repository is not granted");
});

test("GitHub rejects malformed pull request arguments at the boundary", async () => {
  const gateway = createGitHubMcpGateway({ octokit: new Octokit({ auth: "secret" }), repository: "acme/product" });
  const session = gateway.createSession({
    tools: ["github.createPullRequest"], expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.callTool(session.token, "github.createPullRequest", {
    repository: "acme/product", base: "main", branch: "agent/change", title: "Change", message: "Change",
    files: [{ path: "README.md" }],
  })).rejects.toThrow("GitHub file content is required");
});

test("GitHub creates a branch, commit, and pull request through the gateway", async () => {
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
    now: () => new Date("2026-07-24T12:00:00Z"),
  });
  const session = gateway.createSession({
    tools: ["github.createPullRequest"], expiresAt: new Date("2026-07-24T12:05:00Z"),
  });

  await expect(gateway.callTool(session.token, "github.createPullRequest", {
    repository: "acme/product", base: "main", branch: "agent/change", title: "Change",
    message: "Change", files: [{ path: "README.md", content: "updated" }],
  })).resolves.toEqual({ number: 12 });

  expect(requests.map(({ url, method }) => [method ?? "GET", url.replace("https://api.github.com/repos/acme/product/", "")])).toEqual([
    ["GET", "git/ref/heads%2Fmain"], ["GET", "git/commits/base-commit"], ["POST", "git/blobs"],
    ["POST", "git/trees"], ["POST", "git/commits"], ["POST", "git/refs"], ["POST", "pulls"],
  ]);
  expect(JSON.parse(requests[5].body!)).toEqual({ ref: "refs/heads/agent/change", sha: "commit" });
});
