import { App, Octokit } from "octokit";
import { createMcpGateway, type McpGateway, type McpTool } from "./gateway";

const tools: readonly McpTool[] = [{ name: "github.createPullRequest" }];

type PullRequestFile = { path: string; content: string };
type PullRequestRequest = {
  repository: string;
  base: string;
  branch: string;
  title: string;
  body?: string;
  message: string;
  files: PullRequestFile[];
};

function string(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) throw new Error(message);
  return value;
}

function parsePullRequestRequest(value: Record<string, unknown>): PullRequestRequest {
  if (!Array.isArray(value.files) || !value.files.length) {
    throw new Error("GitHub pull request requires at least one file");
  }
  return {
    repository: string(value.repository, "GitHub repository is required"),
    base: string(value.base, "GitHub base is required"),
    branch: string(value.branch, "GitHub branch is required"),
    title: string(value.title, "GitHub title is required"),
    ...(value.body === undefined ? {} : { body: string(value.body, "GitHub body must be a string") }),
    message: string(value.message, "GitHub commit message is required"),
    files: value.files.map((file): PullRequestFile => {
      if (!file || typeof file !== "object" || Array.isArray(file)) throw new Error("GitHub file must be an object");
      const fields = Object.fromEntries(Object.entries(file));
      return {
        path: string(fields.path, "GitHub file path is required"),
        content: string(fields.content, "GitHub file content is required"),
      };
    }),
  };
}

function repositoryParts(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length) throw new Error("GitHub repository must be owner/name");
  return { owner, repo };
}

export async function createGitHubAppInstallationClient(options: {
  appId: string;
  privateKey: string;
  installationId: number;
}): Promise<Octokit> {
  return new App({ appId: options.appId, privateKey: options.privateKey })
    .getInstallationOctokit(options.installationId);
}

export function createGitHubMcpGateway(options: {
  octokit: Octokit;
  repository: string;
  now?: () => Date;
  createToken?: () => string;
}): McpGateway {
  const repository = repositoryParts(options.repository);

  return createMcpGateway({
    now: options.now,
    createToken: options.createToken,
    upstream: {
      listTools: async () => tools,
      async callTool(name, args) {
        if (name !== "github.createPullRequest") throw new Error(`Unknown GitHub tool: ${name}`);
        const input = parsePullRequestRequest(args);
        if (input.repository !== options.repository) throw new Error("GitHub repository is not granted");

        const head = await options.octokit.rest.git.getRef({
          ...repository,
          ref: `heads/${input.base}`,
        });
        const commit = await options.octokit.rest.git.getCommit({
          ...repository,
          commit_sha: head.data.object.sha,
        });
        const tree = await options.octokit.rest.git.createTree({
          ...repository,
          base_tree: commit.data.tree.sha,
          tree: await Promise.all(input.files.map(async (file) => ({
            path: file.path,
            mode: "100644" as const,
            type: "blob" as const,
            sha: (await options.octokit.rest.git.createBlob({
              ...repository,
              content: file.content,
              encoding: "utf-8",
            })).data.sha,
          }))),
        });
        const next = await options.octokit.rest.git.createCommit({
          ...repository,
          message: input.message,
          tree: tree.data.sha,
          parents: [head.data.object.sha],
        });
        await options.octokit.rest.git.createRef({
          ...repository,
          ref: `refs/heads/${input.branch}`,
          sha: next.data.sha,
        });
        return (await options.octokit.rest.pulls.create({
          ...repository,
          title: input.title,
          body: input.body,
          head: input.branch,
          base: input.base,
        })).data;
      },
    },
  });
}
