import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InputProvisioner, RepositoryInput } from "../agents";

export interface RepositoryCheckoutSource {
  provider: string;
  checkout(input: RepositoryInput, directory: string): Promise<{ revision: string }>;
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

async function initializeGitWorkspace(directory: string, branch: string): Promise<string> {
  await git(directory, ["init", "--initial-branch", branch]);
  await git(directory, ["config", "user.name", "Sweat Agent"]);
  await git(directory, ["config", "user.email", "agent@sweat.local"]);
  await git(directory, ["config", "commit.gpgsign", "false"]);
  await git(directory, ["add", "--all"]);
  await git(directory, ["commit", "--quiet", "--message", "Sweat base"]);
  return (await git(directory, ["rev-parse", "HEAD"])).trim();
}

export function createRepositoryWorkspaceProvisioner(options: {
  sources: readonly RepositoryCheckoutSource[];
  createDirectory?: () => Promise<string>;
  removeDirectory?: (directory: string) => Promise<void>;
}): InputProvisioner {
  const sources = new Map(options.sources.map((source) => [source.provider, source]));
  const createDirectory = options.createDirectory ?? (() => mkdtemp(join(tmpdir(), "sweat-run-")));
  const removeDirectory = options.removeDirectory ?? ((directory) => rm(directory, { force: true, recursive: true }));

  return {
    async prepare(inputs, context) {
      const repositories = inputs.filter((input): input is RepositoryInput => input.type === "repository");
      if (!repositories.length) return {};
      if (repositories.length !== 1 || inputs.length !== 1) {
        throw new Error("A run currently supports one repository workspace");
      }
      const input = repositories[0];
      const source = sources.get(input.provider);
      if (!source) throw new Error(`Unsupported repository provider: ${input.provider}`);
      const path = await createDirectory();
      try {
        const checkout = await source.checkout(input, path);
        const branch = `sweat/${context.runId}`;
        const baseCommit = await initializeGitWorkspace(path, branch);
        return {
          workspace: {
            path,
            git: {
              repository: input.repository,
              baseRevision: checkout.revision,
              baseCommit,
              branch,
            },
            dispose: () => removeDirectory(path),
          },
        };
      } catch (error) {
        await removeDirectory(path);
        throw error;
      }
    },
  };
}
