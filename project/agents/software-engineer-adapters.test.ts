import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Octokit } from "octokit";
import {
  createGitHubSoftwareEngineerAdapter,
  createWorkspaceGrillAdapter,
} from "./software-engineer-adapters";

test("workspace.grill applies only when grantContext.grillId is set", () => {
  const adapter = createWorkspaceGrillAdapter({
    port: {
      setFrontier: () => undefined,
      setIssueProposal: () => undefined,
    },
  });
  expect(adapter.capability?.applies?.({})).toBe(false);
  expect(adapter.capability?.applies?.({ grantContext: {} })).toBe(false);
  expect(
    adapter.capability?.applies?.({ grantContext: { grillId: "grill-1" } }),
  ).toBe(true);
});

test("GitHub PR merge base uses grantContext.repositoryBase when set", async () => {
  const requests: Array<{ url: string; body?: string }> = [];
  const adapter = createGitHubSoftwareEngineerAdapter({
    octokit: new Octokit({
      auth: "secret",
      request: {
        fetch: async (url: string, init?: RequestInit) => {
          requests.push({
            url,
            body: typeof init?.body === "string" ? init.body : undefined,
          });
          if (url.includes("git/ref/heads%2Fsweat%2Frun-1")) {
            return Response.json({ message: "Not Found" }, { status: 404 });
          }
          if (url.includes("git/ref/heads%2Ffeat%2Finitiative")) {
            return Response.json({ object: { sha: "base-commit" } });
          }
          if (url.includes("git/commits/base-commit")) {
            return Response.json({ tree: { sha: "base-tree" } });
          }
          if (url.includes("/git/blobs")) return Response.json({ sha: "blob" });
          if (url.includes("/git/trees")) return Response.json({ sha: "tree" });
          if (url.includes("/git/commits")) {
            return Response.json({ sha: "commit" });
          }
          if (url.includes("/git/refs")) return Response.json({});
          if (url.includes("/pulls")) return Response.json({ number: 9 });
          throw new Error(`Unexpected GitHub request: ${url}`);
        },
      },
    }),
    repository: "acme/widgets",
    base: "main",
    verifyCommand: "true",
  });

  const workspace = await mkdtemp(join(tmpdir(), "sweat-base-"));
  try {
    const git = async (args: string[]) => {
      const process = Bun.spawn(["git", "-C", workspace, ...args], {
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, err] = await Promise.all([
        process.exited,
        new Response(process.stderr).text(),
      ]);
      if (code) throw new Error(err);
    };
    await writeFile(join(workspace, "README.md"), "before\n");
    await git(["init", "--initial-branch", "sweat/run-1"]);
    await git(["config", "user.name", "Test"]);
    await git(["config", "user.email", "test@example.com"]);
    await git(["config", "commit.gpgsign", "false"]);
    await git(["add", "README.md"]);
    await git(["commit", "--quiet", "--message", "Base"]);
    const baseCommit = (
      await new Response(
        Bun.spawn(["git", "-C", workspace, "rev-parse", "HEAD"], {
          stdout: "pipe",
        }).stdout,
      ).text()
    ).trim();
    await writeFile(join(workspace, "README.md"), "after\n");
    await git(["add", "README.md"]);
    await git(["commit", "--quiet", "--message", "Change"]);

    const upstream = adapter.capability!.createUpstream({
      workspace: {
        path: workspace,
        git: {
          repository: "acme/widgets",
          baseRevision: "feat/initiative",
          baseCommit,
          branch: "sweat/run-1",
        },
        dispose: async () => {},
      },
      sandbox: {
        exec: async () => ({ exitCode: 0, stdout: "", stderr: "" }),
      },
      grantContext: { repositoryBase: "feat/initiative" },
    });

    await upstream.callTool("github.create_pull_request", { title: "Ship" });
    expect(
      requests.some((request) =>
        request.url.includes("heads%2Ffeat%2Finitiative"),
      ),
    ).toBe(true);
    expect(requests.some((request) => request.url.includes("heads%2Fmain"))).toBe(
      false,
    );
    const createPull = requests.find(
      (request) =>
        request.url.endsWith("/pulls") && request.body !== undefined,
    );
    expect(JSON.parse(createPull!.body!)).toMatchObject({
      base: "feat/initiative",
      head: "sweat/run-1",
    });
  } finally {
    await rm(workspace, { force: true, recursive: true });
  }
});
