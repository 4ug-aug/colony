import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Octokit } from "octokit";
import { createGitHubRepositoryCheckoutSource } from "./github";

async function git(directory: string, args: readonly string[]): Promise<string> {
  const process = Bun.spawn(["git", "-C", directory, ...args], {
    env: { PATH: Bun.env.PATH },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  if (exitCode) throw new Error(stderr.trim() || `git ${args[0]} failed`);
  return stdout;
}

function octokitForArchives(archives: Record<string, string>): Octokit {
  return new Octokit({
    auth: "secret",
    request: {
      fetch: async (url: string) => {
        for (const [ref, body] of Object.entries(archives)) {
          if (
            url.includes(`/commits/${encodeURIComponent(ref)}`) ||
            url.includes(`/commits/${ref}`)
          ) {
            return Response.json({ sha: `${ref}-sha` });
          }
          if (url.includes(`/tarball/${ref}-sha`) || url.includes(`/tarball/${encodeURIComponent(`${ref}-sha`)}`)) {
            return new Response(body);
          }
        }
        throw new Error(`Unexpected GitHub request: ${url}`);
      },
    },
  });
}

async function extractArchive(archive: string, directory: string): Promise<void> {
  const body = (await Bun.file(archive).text()).trim();
  if (body === "line") await Bun.write(join(directory, "README.md"), "line\n");
  else if (body === "child") {
    await Bun.write(join(directory, "README.md"), "line\n");
    await Bun.write(join(directory, "child.ts"), "child\n");
  } else if (body === "child-a") await Bun.write(join(directory, "README.md"), "alpha\n");
  else if (body === "child-b") await Bun.write(join(directory, "README.md"), "beta\n");
  else throw new Error(`Unexpected archive: ${body}`);
}

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
    expect(await Bun.file(join(directory, ".git", "HEAD")).exists()).toBe(false);
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

test("checkout merges extra heads onto the line and leaves git history", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sweat-merge-"));
  try {
    const source = createGitHubRepositoryCheckoutSource({
      octokit: octokitForArchives({
        "sweat/issue/COL-1": "line",
        "sweat/child-1": "child",
      }),
      extract: extractArchive,
    });
    const result = await source.checkout(
      {
        type: "repository",
        provider: "github",
        repository: "acme/widgets",
        revision: "sweat/issue/COL-1",
        mergeRevisions: ["sweat/child-1"],
      },
      directory,
    );
    expect(result).toEqual({ revision: "sweat/issue/COL-1-sha" });
    expect(await Bun.file(join(directory, "README.md")).text()).toBe("line\n");
    expect(await Bun.file(join(directory, "child.ts")).text()).toBe("child\n");
    const root = (await git(directory, ["rev-list", "--max-parents=0", "HEAD"])).trim();
    const head = (await git(directory, ["rev-parse", "HEAD"])).trim();
    expect(head).not.toBe(root);
    expect(await git(directory, ["ls-tree", "--name-only", root])).toContain("README.md");
    expect(await git(directory, ["ls-tree", "--name-only", root])).not.toContain("child.ts");
    expect(await git(directory, ["ls-tree", "--name-only", head])).toContain("child.ts");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("checkout fails when extra heads do not merge cleanly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sweat-merge-conflict-"));
  try {
    const source = createGitHubRepositoryCheckoutSource({
      octokit: octokitForArchives({
        "sweat/issue/COL-1": "line",
        "sweat/child-a": "child-a",
        "sweat/child-b": "child-b",
      }),
      extract: extractArchive,
    });
    await expect(
      source.checkout(
        {
          type: "repository",
          provider: "github",
          repository: "acme/widgets",
          revision: "sweat/issue/COL-1",
          mergeRevisions: ["sweat/child-a", "sweat/child-b"],
        },
        directory,
      ),
    ).rejects.toThrow();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
