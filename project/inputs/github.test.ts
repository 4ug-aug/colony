import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Octokit } from "octokit";
import { createGitHubRepositoryCheckoutSource } from "./github";

test("checkout creates a missing sweat/issue line from the fallback revision", async () => {
  const requests: string[] = [];
  const octokit = new Octokit({
    auth: "secret",
    request: {
      fetch: async (url: string) => {
        requests.push(url);
        if (url.includes("commits/sweat%2Fissue%2FCOL-1") || url.includes("commits/sweat/issue/COL-1")) {
          return Response.json({ message: "Not Found" }, { status: 404 });
        }
        if (url.includes("commits/main")) {
          return Response.json({ sha: "base-sha" });
        }
        if (url.includes("/git/refs")) return Response.json({});
        if (url.includes("/tarball/")) return new Response("archive");
        throw new Error(`Unexpected GitHub request: ${url}`);
      },
    },
  });
  const directory = await mkdtemp(join(tmpdir(), "sweat-issue-line-"));
  try {
    const source = createGitHubRepositoryCheckoutSource({
      octokit,
      fallbackRevision: "main",
      extract: async () => {},
    });
    const result = await source.checkout(
      {
        type: "repository",
        provider: "github",
        repository: "acme/widgets",
        revision: "sweat/issue/COL-1",
      },
      directory,
    );
    expect(result).toEqual({ revision: "base-sha" });
    expect(requests.some((url) => url.includes("/git/refs"))).toBe(true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("checkout does not create a missing non-line revision", async () => {
  const octokit = new Octokit({
    auth: "secret",
    request: {
      fetch: async (url: string) => {
        if (url.includes("commits/feat%2Fauth") || url.includes("commits/feat/auth")) {
          return Response.json({ message: "Not Found" }, { status: 404 });
        }
        throw new Error(`Unexpected GitHub request: ${url}`);
      },
    },
  });
  const directory = await mkdtemp(join(tmpdir(), "sweat-feat-"));
  try {
    const source = createGitHubRepositoryCheckoutSource({
      octokit,
      fallbackRevision: "main",
      extract: async () => {},
    });
    await expect(
      source.checkout(
        {
          type: "repository",
          provider: "github",
          repository: "acme/widgets",
          revision: "feat/auth",
        },
        directory,
      ),
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
