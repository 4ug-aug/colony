import { App, Octokit } from "octokit";
import { createMcpGateway, type McpGateway, type McpTool, type McpUpstream } from "./gateway";

const tools: readonly McpTool[] = [{
  name: "github.create_pull_request",
  description: "Publish this run's committed branch and create a pull request. Do not use git push or configure a remote: GitHub authentication remains host-side.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      body: { type: "string" },
    },
    required: ["title"],
    additionalProperties: false,
  },
}];

type PullRequestRequest = { title: string; body?: string };
type Change = { path: string; deleted: boolean };

function string(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) throw new Error(message);
  return value;
}

function parsePullRequestRequest(value: Record<string, unknown>): PullRequestRequest {
  return {
    title: string(value.title, "GitHub pull request title is required"),
    ...(value.body === undefined ? {} : { body: string(value.body, "GitHub pull request body must be a string") }),
  };
}

function repositoryParts(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length) throw new Error("GitHub repository must be owner/name");
  return { owner, repo };
}

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

function changes(value: string): readonly Change[] {
  const fields = value.split("\0");
  const output: Change[] = [];
  for (let index = 0; index < fields.length - 1; index += 2) {
    const status = fields[index];
    const path = fields[index + 1];
    if (!status || !path) continue;
    output.push({ path, deleted: status.startsWith("D") });
  }
  return output;
}

async function workspaceCommits(options: {
  workspace: string;
  branch: string;
  baseCommit: string;
}): Promise<readonly string[]> {
  const branch = (await git(options.workspace, ["branch", "--show-current"])).trim();
  if (branch !== options.branch) throw new Error(`Run must remain on branch ${options.branch}`);
  if ((await git(options.workspace, ["status", "--porcelain"])).trim()) {
    throw new Error("Commit workspace changes before creating a pull request");
  }
  return (await git(options.workspace, ["rev-list", "--reverse", `${options.baseCommit}..${options.branch}`]))
    .trim()
    .split("\n")
    .filter(Boolean);
}

export async function createGitHubAppInstallationClient(options: {
  appId: string;
  privateKey: string;
  installationId: number;
}): Promise<Octokit> {
  return new App({ appId: options.appId, privateKey: options.privateKey })
    .getInstallationOctokit(options.installationId);
}

export async function createGitHubCliClient(): Promise<Octokit> {
  const process = Bun.spawn(["gh", "auth", "token"], { stdout: "pipe", stderr: "pipe" });
  const [exitCode, stdout] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
  ]);
  if (exitCode || !stdout.trim()) throw new Error("GitHub CLI authentication is required");
  return new Octokit({ auth: stdout.trim() });
}

export function createGitHubMcpUpstream(options: {
  octokit: Octokit;
  repository: string;
  workspace: string;
  branch: string;
  baseCommit: string;
  base: string;
}): McpUpstream {
  const repository = repositoryParts(options.repository);

  return {
    listTools: async () => tools,
    async callTool(name, args) {
      if (name !== "github.create_pull_request") throw new Error(`Unknown GitHub tool: ${name}`);
      const input = parsePullRequestRequest(args);
      const commits = await workspaceCommits(options);
      if (!commits.length) throw new Error("Run branch has no commits to publish");

      const head = await options.octokit.rest.git.getRef({
        ...repository,
        ref: `heads/${options.base}`,
      });
      const commit = await options.octokit.rest.git.getCommit({
        ...repository,
        commit_sha: head.data.object.sha,
      });
      let remoteCommit = head.data.object.sha;
      let remoteTree = commit.data.tree.sha;
      for (const localCommit of commits) {
        const localParent = (await git(options.workspace, ["rev-parse", `${localCommit}^`])).trim();
        const changed = changes(await git(options.workspace, ["diff", "--name-status", "-z", localParent, localCommit]));
        const tree = await options.octokit.rest.git.createTree({
          ...repository,
          base_tree: remoteTree,
          tree: await Promise.all(changed.map(async (file) => file.deleted
            ? { path: file.path, mode: "100644" as const, type: "blob" as const, sha: null }
            : {
                path: file.path,
                mode: "100644" as const,
                type: "blob" as const,
                sha: (await options.octokit.rest.git.createBlob({
                  ...repository,
                  content: await git(options.workspace, ["show", `${localCommit}:${file.path}`]),
                  encoding: "utf-8",
                })).data.sha,
              })),
        });
        const next = await options.octokit.rest.git.createCommit({
          ...repository,
          message: (await git(options.workspace, ["log", "-1", "--format=%B", localCommit])).trim(),
          tree: tree.data.sha,
          parents: [remoteCommit],
        });
        remoteCommit = next.data.sha;
        remoteTree = tree.data.sha;
      }
      await options.octokit.rest.git.createRef({
        ...repository,
        ref: `refs/heads/${options.branch}`,
        sha: remoteCommit,
      });
      return (await options.octokit.rest.pulls.create({
        ...repository,
        title: input.title,
        body: input.body,
        head: options.branch,
        base: options.base,
      })).data;
    },
  };
}

export function createGitHubMcpGateway(options: {
  octokit: Octokit;
  repository: string;
  workspace: string;
  branch: string;
  baseCommit: string;
  base: string;
  now?: () => Date;
  createToken?: () => string;
}): McpGateway {
  return createMcpGateway({
    now: options.now,
    createToken: options.createToken,
    upstream: createGitHubMcpUpstream(options),
  });
}
