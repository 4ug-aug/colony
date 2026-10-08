import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { httpStatus, readActivity, readAnnotations, readChecks } from "./github-feedback";
import { boundStepText } from "../runtime/step";
import { extractGitHubCommit, replaceWorktree } from "../inputs/github";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMcpGateway, type McpGateway, type McpTool, type McpUpstream } from "./gateway";

const tools: readonly McpTool[] = [
  {
    name: "github.create_pull_request",
    description: "Publish the workspace's committed HEAD under this run's platform-assigned remote branch, then create or update its pull request. The local branch name does not matter. It is safe to retry after a timeout. Do not use git push or configure a remote: GitHub authentication remains host-side.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        body: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    },
  },
  {
    name: "github.compare",
    description: "List files changed between two refs in the granted repository. Default is path and status only. Set includeDiff to true for a truncated unified diff. Compare first; use github.get_file only for named paths. Do not git fetch.",
    inputSchema: {
      type: "object",
      properties: {
        base: { type: "string" },
        head: { type: "string" },
        includeDiff: { type: "boolean" },
      },
      required: ["base", "head"],
      additionalProperties: false,
    },
  },
  {
    name: "github.get_file",
    description: "Read one file at a branch, tag, or SHA in the granted repository. A directory path returns a truncated entry list. Use after github.compare for named paths, not to walk a whole tree.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        ref: { type: "string" },
      },
      required: ["path", "ref"],
      additionalProperties: false,
    },
  },
  {
    name: "github.get_pull_request",
    description: "Read a pull request in the granted repository: title, body, head and base refs, state, and changed-file list without a patch.",
    inputSchema: {
      type: "object",
      properties: { number: { type: "integer", minimum: 1 } },
      required: ["number"],
      additionalProperties: false,
    },
  },
  {
    name: "github.get_pull_request_feedback",
    description: "Read feedback on a pull request: submitted reviews with their inline comments, conversation comments, and failed checks on the head commit with annotations. Pass since (ISO timestamp) to see only reviews and comments created after it.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "integer", minimum: 1 },
        since: { type: "string" },
      },
      required: ["number"],
      additionalProperties: false,
    },
  },
  {
    name: "github.checkout_pull_request",
    description: "Replace the workspace with an open pull request's head so you can work on that pull request. Commit your changes, then call github.push_to_pull_request. Commit or discard workspace edits first.",
    inputSchema: {
      type: "object",
      properties: { number: { type: "integer", minimum: 1 } },
      required: ["number"],
      additionalProperties: false,
    },
  },
  {
    name: "github.push_to_pull_request",
    description: "Push the commits made since github.checkout_pull_request onto that pull request's own branch. Refuses if the pull request moved in the meantime; check it out again then.",
    inputSchema: {
      type: "object",
      properties: { number: { type: "integer", minimum: 1 } },
      required: ["number"],
      additionalProperties: false,
    },
  },
  {
    name: "github.comment_on_pull_request",
    description: "Post a comment on a pull request's conversation.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "integer", minimum: 1 },
        body: { type: "string" },
      },
      required: ["number", "body"],
      additionalProperties: false,
    },
  },
  {
    name: "github.review_pull_request",
    description: "Submit a review on a pull request: COMMENT, APPROVE, or REQUEST_CHANGES, with an overall body and optional line comments on the head commit.",
    inputSchema: {
      type: "object",
      properties: {
        number: { type: "integer", minimum: 1 },
        event: { type: "string", enum: ["COMMENT", "APPROVE", "REQUEST_CHANGES"] },
        body: { type: "string" },
        comments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              path: { type: "string" },
              line: { type: "integer", minimum: 1 },
              body: { type: "string" },
            },
            required: ["path", "line", "body"],
            additionalProperties: false,
          },
        },
      },
      required: ["number", "event", "body"],
      additionalProperties: false,
    },
  },
];

const reviewEvents = { COMMENT: "Commented", APPROVE: "Approved", REQUEST_CHANGES: "Requested changes" } as const;
type ReviewEvent = keyof typeof reviewEvents;
type ReviewComment = { path: string; line: number; body: string };
/** A pull request checked out into the workspace: its local commit and the remote head it mirrors. */
type CheckedOut = { local: string; remote: string; ref: string };

const textResult = (text: string) => ({ content: [{ type: "text" as const, text }] });

function pullRequestNumber(value: Record<string, unknown>): number {
  if (!Number.isInteger(value.number) || (value.number as number) < 1)
    throw new Error("GitHub pull request number is required");
  return value.number as number;
}

function reviewInput(value: Record<string, unknown>): { event: ReviewEvent; body: string; comments: ReviewComment[] } {
  if (typeof value.event !== "string" || !(value.event in reviewEvents))
    throw new Error("GitHub review event must be COMMENT, APPROVE, or REQUEST_CHANGES");
  const comments = (Array.isArray(value.comments) ? value.comments : []).map((comment) => {
    const { path, line, body } = (comment ?? {}) as Record<string, unknown>;
    if (typeof path !== "string" || !path || !Number.isInteger(line) || typeof body !== "string" || !body.trim())
      throw new Error("GitHub review comments need path, line, and body");
    return { path, line: line as number, body };
  });
  return { event: value.event as ReviewEvent, body: string(value.body, "GitHub review body is required"), comments };
}

type PullRequestRequest = { title: string; body?: string };
type Change = { path: string; deleted: boolean };
type RemoteBranch = { sha: string; tree: string };
type WorkspaceState = { commits: readonly string[]; head: string; tree: string };
type CompareRequest = { base: string; head: string; includeDiff: boolean };
type GetFileRequest = { path: string; ref: string };

const directoryEntryLimit = 100;

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

function parseCompareRequest(value: Record<string, unknown>): CompareRequest {
  return {
    base: string(value.base, "GitHub compare base is required"),
    head: string(value.head, "GitHub compare head is required"),
    includeDiff: value.includeDiff === true,
  };
}

function parseGetFileRequest(value: Record<string, unknown>): GetFileRequest {
  return {
    path: string(value.path, "GitHub file path is required"),
    ref: string(value.ref, "GitHub file ref is required"),
  };
}

function shortStatus(status: string): string {
  if (status === "added") return "A";
  if (status === "removed") return "D";
  if (status === "renamed") return "R";
  return "M";
}

function repositoryParts(repository: string): { owner: string; repo: string } {
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length) throw new Error("GitHub repository must be owner/name");
  return { owner, repo };
}

async function git(directory: string, args: readonly string[]): Promise<string> {
  return new TextDecoder().decode(await gitBytes(directory, args));
}

async function gitBytes(directory: string, args: readonly string[]): Promise<Uint8Array> {
  const process = Bun.spawn(["git", "-C", directory, ...args], {
    env: { PATH: Bun.env.PATH },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).bytes(),
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

type TreeItem = NonNullable<Parameters<Octokit["rest"]["git"]["createTree"]>[0]>["tree"][number];
type TreeMode = NonNullable<TreeItem["mode"]>;
type TreeType = NonNullable<TreeItem["type"]>;

async function materializeTree(options: {
  octokit: Octokit;
  repository: { owner: string; repo: string };
  workspace: string;
  commit: string;
  changed: readonly Change[];
}): Promise<TreeItem[]> {
  return Promise.all(options.changed.map(async (file): Promise<TreeItem> => {
    // GitHub rejects a tree entry without mode and type, deletions included; sha null drops the path whatever its real mode was.
    if (file.deleted) return { path: file.path, mode: "100644", type: "blob", sha: null };
    const entry = new TextDecoder().decode(await gitBytes(options.workspace, ["ls-tree", "-z", options.commit, "--", file.path]));
    const match = /^(040000|100644|100755|120000|160000) (blob|tree|commit) ([0-9a-f]+)\t/.exec(entry);
    if (!match) throw new Error(`Git tree entry not found for ${file.path}`);
    const [, rawMode, rawType, sha] = match;
    const mode = rawMode as TreeMode;
    const type = rawType as TreeType;
    if (type !== "blob") return { path: file.path, mode, type, sha };
    const content = Buffer.from(await gitBytes(options.workspace, ["show", `${options.commit}:${file.path}`])).toString("base64");
    return {
      path: file.path,
      mode,
      type,
      sha: (await options.octokit.rest.git.createBlob({
        ...options.repository,
        content,
        encoding: "base64",
      })).data.sha,
    };
  }));
}

async function workspaceState(options: {
  workspace: string;
  baseCommit: string;
}): Promise<WorkspaceState> {
  if ((await git(options.workspace, ["status", "--porcelain"])).trim()) {
    throw new Error("Commit workspace changes before creating a pull request");
  }
  const head = (await git(options.workspace, ["rev-parse", "HEAD"])).trim();
  let mergeBase: string;
  try {
    mergeBase = (await git(options.workspace, ["merge-base", options.baseCommit, head])).trim();
  } catch {
    throw new Error("Workspace HEAD must descend from the prepared base commit");
  }
  if (mergeBase !== options.baseCommit) {
    throw new Error("Workspace HEAD must descend from the prepared base commit");
  }
  const commits = (await git(options.workspace, ["rev-list", "--reverse", `${options.baseCommit}..${head}`]))
    .trim()
    .split("\n")
    .filter(Boolean);
  return {
    commits,
    head,
    tree: (await git(options.workspace, ["rev-parse", `${head}^{tree}`])).trim(),
  };
}

function hasStatus(error: unknown, status: number): boolean {
  return typeof error === "object" && error !== null && "status" in error
    && (error as { status?: unknown }).status === status;
}

async function remoteBranch(options: {
  octokit: Octokit;
  repository: { owner: string; repo: string };
  branch: string;
}): Promise<RemoteBranch | undefined> {
  try {
    const ref = await options.octokit.rest.git.getRef({
      ...options.repository,
      ref: `heads/${options.branch}`,
    });
    const commit = await options.octokit.rest.git.getCommit({
      ...options.repository,
      commit_sha: ref.data.object.sha,
    });
    return { sha: ref.data.object.sha, tree: commit.data.tree.sha };
  } catch (error) {
    if (hasStatus(error, 404)) return undefined;
    throw error;
  }
}

async function existingPullRequest(options: {
  octokit: Octokit;
  repository: { owner: string; repo: string };
  branch: string;
  base: string;
}): Promise<unknown | undefined> {
  const response = await options.octokit.rest.pulls.list({
    ...options.repository,
    state: "all",
    head: `${options.repository.owner}:${options.branch}`,
    base: options.base,
  });
  return response.data[0];
}

async function compareRefs(options: {
  octokit: Octokit;
  repository: { owner: string; repo: string };
  args: Record<string, unknown>;
}): Promise<{ base: string; head: string; files: { path: string; status: string }[]; diff?: string }> {
  const input = parseCompareRequest(options.args);
  const comparison = await options.octokit.rest.repos.compareCommits({
    ...options.repository,
    base: input.base,
    head: input.head,
  });
  const files = (comparison.data.files ?? []).map((file) => ({
    path: file.filename,
    status: shortStatus(file.status ?? "modified"),
  }));
  if (!input.includeDiff) return { base: input.base, head: input.head, files };
  const diff = boundStepText(
    (comparison.data.files ?? []).map((file) => file.patch).filter(Boolean).join("\n"),
  );
  return { base: input.base, head: input.head, files, diff };
}

async function getFile(options: {
  octokit: Octokit;
  repository: { owner: string; repo: string };
  args: Record<string, unknown>;
}): Promise<unknown> {
  const input = parseGetFileRequest(options.args);
  const response = await options.octokit.rest.repos.getContent({
    ...options.repository,
    path: input.path,
    ref: input.ref,
  });
  if (Array.isArray(response.data)) {
    const truncated = response.data.length > directoryEntryLimit;
    return {
      type: "dir",
      path: input.path,
      ref: input.ref,
      entries: response.data.slice(0, directoryEntryLimit).map((entry) => ({
        path: entry.path,
        type: entry.type,
      })),
      ...(truncated ? { truncated: true } : {}),
    };
  }
  if (response.data.type !== "file") {
    throw new Error(`GitHub path is not a file: ${input.path}`);
  }
  if (!response.data.content || response.data.encoding === "none") {
    throw new Error("GitHub file is too large to read; name a smaller path");
  }
  return {
    path: response.data.path,
    ref: input.ref,
    content: boundStepText(Buffer.from(response.data.content, "base64").toString("utf8")),
  };
}

async function getPullRequest(options: {
  octokit: Octokit;
  repository: { owner: string; repo: string };
  args: Record<string, unknown>;
}): Promise<unknown> {
  const input = { number: pullRequestNumber(options.args) };
  const [pullRequest, files] = await Promise.all([
    options.octokit.rest.pulls.get({ ...options.repository, pull_number: input.number }),
    options.octokit.rest.pulls.listFiles({
      ...options.repository,
      pull_number: input.number,
      per_page: 100,
    }),
  ]);
  return {
    number: pullRequest.data.number,
    title: pullRequest.data.title,
    body: pullRequest.data.body ?? "",
    state: pullRequest.data.state,
    head: { ref: pullRequest.data.head.ref, sha: pullRequest.data.head.sha },
    base: { ref: pullRequest.data.base.ref, sha: pullRequest.data.base.sha },
    files: files.data.map((file) => ({
      path: file.filename,
      status: shortStatus(file.status),
    })),
  };
}

const feedbackLimit = 20_000;

const clip = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}...` : text);

const feedbackAuthor = (user: { login: string; type: string } | null) =>
  user ? `${user.login}${user.type === "Bot" && !user.login.endsWith("[bot]") ? " [bot]" : ""}` : "unknown";

async function getPullRequestFeedback(options: {
  octokit: Octokit;
  repository: { owner: string; repo: string };
  args: Record<string, unknown>;
}): Promise<ReturnType<typeof textResult>> {
  const number = pullRequestNumber(options.args);
  const sinceText = options.args.since;
  if (sinceText !== undefined && (typeof sinceText !== "string" || Number.isNaN(Date.parse(sinceText))))
    throw new Error("GitHub feedback since must be an ISO timestamp");
  const { octokit, repository: repo } = options;
  const pullRequest = await octokit.rest.pulls.get({ ...repo, pull_number: number });
  const sha = pullRequest.data.head.sha;
  const [activity, checks] = await Promise.all([
    readActivity(octokit, repo, number, sinceText),
    readChecks(octokit, repo, sha),
  ]);

  const lines = [`Pull request #${number}: ${pullRequest.data.title}`];
  for (const review of activity.reviews) {
    lines.push("", `Review by ${feedbackAuthor(review.author)} (${review.state}, ${review.submittedAt}):`);
    if (review.body) lines.push(clip(review.body, 4000));
    for (const comment of review.inlineComments) {
      lines.push(`- ${comment.path}:${comment.line ?? "?"} ${clip(comment.body, 2000)}`);
      lines.push(...comment.diffHunk.split("\n").slice(-6).map((line) => `    ${line}`));
    }
  }
  if (activity.comments.length) {
    lines.push("", "Comments:");
    for (const comment of activity.comments)
      lines.push(`- ${feedbackAuthor(comment.author)} (${comment.createdAt}): ${clip(comment.body, 4000)}`);
  }
  if (checks.kind !== "unavailable" && checks.failed.length) {
    lines.push("", `Failed checks on ${sha.slice(0, 7)}:`);
    for (const run of checks.failed) {
      const annotations = await readAnnotations(octokit, repo, run.id);
      lines.push(`- ${run.name} (${run.conclusion}): ${run.title ?? ""}`);
      if (run.summary) lines.push(clip(run.summary, 1500));
      for (const annotation of annotations)
        lines.push(`  ${annotation.path}:${annotation.start_line} ${annotation.message ?? ""}`);
      if (run.detailsUrl) lines.push(run.detailsUrl);
    }
  }
  if (checks.kind === "unavailable") lines.push("", "Checks unavailable: the GitHub App needs the Checks: read permission.");
  if (lines.length === 1)
    lines.push("", `No reviews, comments, or failed checks${typeof sinceText === "string" ? ` since ${sinceText}` : ""}.`);
  const text = lines.join("\n");
  return textResult(text.length > feedbackLimit ? `${text.slice(0, feedbackLimit)}\n[feedback trimmed]` : text);
}

/** Installation-authenticated client; @octokit/auth-app mints and renews the hour-long tokens. */
export function createGitHubAppInstallationClient(options: {
  appId: string;
  privateKey: string;
  installationId: number;
}): Octokit {
  return new Octokit({ authStrategy: createAppAuth, auth: options });
}

type GitHubAppCredentials = {
  appId: string;
  privateKey: string;
  /** Test seam for GitHub HTTP. */
  fetch?: typeof fetch;
};

const appClient = (options: GitHubAppCredentials, installationId?: number) =>
  new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: options.appId,
      privateKey: options.privateKey,
      ...(installationId === undefined ? {} : { installationId }),
    },
    ...(options.fetch ? { request: { fetch: options.fetch } } : {}),
  });

async function appSlug(app: Octokit, appId: string): Promise<string> {
  try {
    return (await app.rest.apps.getAuthenticated()).data?.slug ?? appId;
  } catch (error) {
    if (httpStatus(error) === 401)
      throw new Error("GitHub rejected the App ID or private key");
    throw error;
  }
}

async function repoInstallation(
  app: Octokit,
  repository: string,
  slug: string,
): Promise<number> {
  try {
    return (await app.rest.apps.getRepoInstallation(repositoryParts(repository))).data.id;
  } catch (error) {
    if (httpStatus(error) === 404)
      throw new Error(
        `GitHub App isn't installed on ${repository}. Install it: ${gitHubAppInstallUrl(slug)}`,
      );
    throw error;
  }
}

/** Checks the App against the repository before it is saved as the workspace GitHub setting. */
export async function connectGitHubApp(
  options: GitHubAppCredentials & { repository: string; base: string },
): Promise<{ slug: string; installationId: number }> {
  const app = appClient(options);
  const slug = await appSlug(app, options.appId);
  const installationId = await repoInstallation(app, options.repository, slug);
  try {
    await appClient(options, installationId).rest.repos.getBranch({
      ...repositoryParts(options.repository),
      branch: options.base,
    });
  } catch (error) {
    if (httpStatus(error) === 404)
      throw new Error(`Branch ${options.base} doesn't exist in ${options.repository}`);
    throw error;
  }
  return { slug, installationId };
}

export type GitHubAppRepository = { fullName: string; defaultBranch: string };

/** Every repository the App can reach, across all of its installations. */
export async function listGitHubAppRepositories(
  options: GitHubAppCredentials,
): Promise<GitHubAppRepository[]> {
  const app = appClient(options);
  await appSlug(app, options.appId);
  const installations = await app.paginate(app.rest.apps.listInstallations, { per_page: 100 });
  const repositories = (
    await Promise.all(
      installations.map((installation) => {
        const client = appClient(options, installation.id);
        return client.paginate(client.rest.apps.listReposAccessibleToInstallation, {
          per_page: 100,
        });
      }),
    )
  ).flat();
  return repositories
    .map((repository) => ({
      fullName: repository.full_name,
      defaultBranch: repository.default_branch,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

export async function listGitHubAppBranches(
  options: GitHubAppCredentials & { repository: string },
): Promise<string[]> {
  const app = appClient(options);
  const slug = await appSlug(app, options.appId);
  const client = appClient(options, await repoInstallation(app, options.repository, slug));
  const branches = await client.paginate(client.rest.repos.listBranches, {
    ...repositoryParts(options.repository),
    per_page: 100,
  });
  return branches.map((branch) => branch.name);
}

export const gitHubAppInstallUrl = (slug: string): string =>
  `https://github.com/apps/${encodeURIComponent(slug)}/installations/new`;

export function createGitHubMcpUpstream(options: {
  octokit: Octokit;
  repository: string;
  workspace: string;
  branch: string;
  baseCommit: string;
  base: string;
}): McpUpstream {
  const repository = repositoryParts(options.repository);
  const checkedOut = new Map<number, CheckedOut>();
  const openPullRequest = async (number: number) => {
    const pullRequest = (await options.octokit.rest.pulls.get({ ...repository, pull_number: number })).data;
    if (pullRequest.state !== "open") throw new Error(`Pull request #${number} is ${pullRequest.state}`);
    // Branches in forks cannot be written with this installation.
    if (pullRequest.head.repo?.full_name !== options.repository)
      throw new Error(`Pull request #${number} comes from ${pullRequest.head.repo?.full_name ?? "a deleted fork"}; it can be reviewed but not pushed to`);
    return pullRequest;
  };
  const requireCleanWorkspace = async () => {
    if ((await git(options.workspace, ["status", "--porcelain"])).trim())
      throw new Error("Commit or discard workspace changes first");
  };

  return {
    listTools: async () => tools,
    async callTool(name, args) {
      if (name === "github.checkout_pull_request") {
        const number = pullRequestNumber(args);
        const pullRequest = await openPullRequest(number);
        await requireCleanWorkspace();
        const files = await mkdtemp(join(tmpdir(), "sweat-pull-request-"));
        try {
          await extractGitHubCommit({ octokit: options.octokit, repository, sha: pullRequest.head.sha, directory: files });
          await git(options.workspace, ["checkout", "-q", "-B", `pull/${number}`]);
          await replaceWorktree(options.workspace, files);
        } finally {
          await rm(files, { recursive: true, force: true });
        }
        await git(options.workspace, ["add", "--all"]);
        await git(options.workspace, ["commit", "--quiet", "--allow-empty", "--message", `Pull request #${number} at ${pullRequest.head.sha.slice(0, 7)}`]);
        checkedOut.set(number, {
          local: (await git(options.workspace, ["rev-parse", "HEAD"])).trim(),
          remote: pullRequest.head.sha,
          ref: pullRequest.head.ref,
        });
        return textResult(`Checked out pull request #${number} (${pullRequest.head.ref} at ${pullRequest.head.sha.slice(0, 7)}). Commit your changes, then call github.push_to_pull_request.`);
      }
      if (name === "github.push_to_pull_request") {
        const number = pullRequestNumber(args);
        const checkout = checkedOut.get(number);
        if (!checkout) throw new Error(`Check out pull request #${number} with github.checkout_pull_request first`);
        await requireCleanWorkspace();
        const commits = (await git(options.workspace, ["rev-list", "--reverse", `${checkout.local}..HEAD`])).trim().split("\n").filter(Boolean);
        if (!commits.length) throw new Error("No new commits to push");
        const pullRequest = await openPullRequest(number);
        if (pullRequest.head.sha !== checkout.remote)
          throw new Error(`Pull request #${number} moved since checkout (now ${pullRequest.head.sha.slice(0, 7)}); check it out again and redo your changes`);
        let remoteCommit = checkout.remote;
        let remoteTree = (await options.octokit.rest.git.getCommit({ ...repository, commit_sha: remoteCommit })).data.tree.sha;
        for (const localCommit of commits) {
          const localParent = (await git(options.workspace, ["rev-parse", `${localCommit}^`])).trim();
          const changed = changes(await git(options.workspace, ["diff", "--name-status", "-z", localParent, localCommit]));
          const tree = await options.octokit.rest.git.createTree({
            ...repository,
            base_tree: remoteTree,
            tree: await materializeTree({ octokit: options.octokit, repository, workspace: options.workspace, commit: localCommit, changed }),
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
        await options.octokit.rest.git.updateRef({ ...repository, ref: `heads/${checkout.ref}`, sha: remoteCommit, force: false });
        checkedOut.set(number, { ...checkout, local: (await git(options.workspace, ["rev-parse", "HEAD"])).trim(), remote: remoteCommit });
        return textResult(`Pushed ${commits.length} commit${commits.length === 1 ? "" : "s"} to pull request #${number} (${checkout.ref}): ${pullRequest.html_url}`);
      }
      if (name === "github.comment_on_pull_request") {
        const number = pullRequestNumber(args);
        const comment = await options.octokit.rest.issues.createComment({
          ...repository,
          issue_number: number,
          body: string(args.body, "GitHub comment body is required"),
        });
        return textResult(`Commented on pull request #${number}: ${comment.data.html_url}`);
      }
      if (name === "github.review_pull_request") {
        const number = pullRequestNumber(args);
        const input = reviewInput(args);
        const head = (await options.octokit.rest.pulls.get({ ...repository, pull_number: number })).data.head.sha;
        const review = await options.octokit.rest.pulls.createReview({
          ...repository,
          pull_number: number,
          commit_id: head,
          event: input.event,
          body: input.body,
          ...(input.comments.length ? { comments: input.comments } : {}),
        });
        return textResult(`${reviewEvents[input.event]} on pull request #${number}: ${review.data.html_url}`);
      }
      if (name === "github.compare") {
        return compareRefs({ octokit: options.octokit, repository, args });
      }
      if (name === "github.get_file") {
        return getFile({ octokit: options.octokit, repository, args });
      }
      if (name === "github.get_pull_request") {
        return getPullRequest({ octokit: options.octokit, repository, args });
      }
      if (name === "github.get_pull_request_feedback") {
        return getPullRequestFeedback({ octokit: options.octokit, repository, args });
      }
      if (name !== "github.create_pull_request") throw new Error(`Unknown GitHub tool: ${name}`);
      const input = parsePullRequestRequest(args);
      const workspace = await workspaceState(options);
      if (!workspace.commits.length) throw new Error("Workspace HEAD has no commits to publish");
      const branch = await remoteBranch({ octokit: options.octokit, repository, branch: options.branch });
      if (branch) {
        if (branch.tree === workspace.tree) {
          const pullRequest = await existingPullRequest({
            octokit: options.octokit, repository, branch: options.branch, base: options.base,
          });
          if (pullRequest) return pullRequest;
          return (await options.octokit.rest.pulls.create({
            ...repository,
            title: input.title,
            body: input.body,
            head: options.branch,
            base: options.base,
          })).data;
        }
        const changed = changes(await git(options.workspace, ["diff", "--name-status", "-z", options.baseCommit, workspace.head]));
        const tree = await options.octokit.rest.git.createTree({
          ...repository,
          base_tree: branch.tree,
          tree: await materializeTree({
            octokit: options.octokit, repository, workspace: options.workspace, commit: workspace.head, changed,
          }),
        });
        const next = await options.octokit.rest.git.createCommit({
          ...repository,
          message: "Sync run branch",
          tree: tree.data.sha,
          parents: [branch.sha],
        });
        await options.octokit.rest.git.updateRef({
          ...repository,
          ref: `heads/${options.branch}`,
          sha: next.data.sha,
          force: false,
        });
        const pullRequest = await existingPullRequest({
          octokit: options.octokit, repository, branch: options.branch, base: options.base,
        });
        if (pullRequest) return pullRequest;
        return (await options.octokit.rest.pulls.create({
          ...repository,
          title: input.title,
          body: input.body,
          head: options.branch,
          base: options.base,
        })).data;
      }

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
      for (const localCommit of workspace.commits) {
        const localParent = (await git(options.workspace, ["rev-parse", `${localCommit}^`])).trim();
        const changed = changes(await git(options.workspace, ["diff", "--name-status", "-z", localParent, localCommit]));
        const tree = await options.octokit.rest.git.createTree({
          ...repository,
          base_tree: remoteTree,
          tree: await materializeTree({
            octokit: options.octokit, repository, workspace: options.workspace, commit: localCommit, changed,
          }),
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
      try {
        await options.octokit.rest.git.createRef({
          ...repository,
          ref: `refs/heads/${options.branch}`,
          sha: remoteCommit,
        });
      } catch (error) {
        const branch = await remoteBranch({ octokit: options.octokit, repository, branch: options.branch });
        if (!hasStatus(error, 422) || !branch || branch.tree !== workspace.tree) throw error;
      }
      try {
        return (await options.octokit.rest.pulls.create({
          ...repository,
          title: input.title,
          body: input.body,
          head: options.branch,
          base: options.base,
        })).data;
      } catch (error) {
        const pullRequest = await existingPullRequest({
          octokit: options.octokit, repository, branch: options.branch, base: options.base,
        });
        if (!hasStatus(error, 422) || !pullRequest) throw error;
        return pullRequest;
      }
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
