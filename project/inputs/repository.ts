import { createHash } from "node:crypto";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { InputProvisioner, RunInput } from "../runs";
import {
  skillGitExcludeLines,
  stageSkillPackages,
  type SkillRuntimeLayout,
  type StagedSkillPackage,
} from "./skills";

export interface RepositoryInput extends RunInput {
  type: "repository";
  provider: string;
  repository: string;
  revision: string;
  /** Extra heads to merge onto `revision` during checkout (Issue integrate). */
  mergeRevisions?: string[];
}

export interface AttachmentInput extends RunInput {
  type: "attachment";
  id: string;
  roomId: string;
  filename: string;
  byteSize: number;
  sha256: string;
}

export interface AttachmentSource {
  read(id: string): Promise<
    | {
        roomId: string;
        filename: string;
        byteSize: number;
        sha256: string;
        bytes: Uint8Array;
      }
    | undefined
  >;
}

export interface RepositoryCheckoutSource {
  provider: string;
  checkout(
    input: RepositoryInput,
    directory: string,
  ): Promise<{ revision: string }>;
}

export type WorkspaceInput = RepositoryInput | AttachmentInput;

export type SkillSource = {
  listForAgent(
    agentDefinitionId: string,
  ): Promise<readonly StagedSkillPackage[]>;
  layoutForAgent(agentDefinitionId: string): SkillRuntimeLayout | undefined;
};

export type WorkspaceProvisionerOptions = {
  sources: readonly RepositoryCheckoutSource[];
  attachmentSource?: AttachmentSource;
  skillSource?: SkillSource;
  createDirectory?: () => Promise<string>;
  removeDirectory?: (directory: string) => Promise<void>;
};

function repositoryInput(input: RunInput): RepositoryInput {
  const value = input as unknown as Record<string, unknown>;
  if (
    input.type !== "repository" ||
    typeof value.provider !== "string" ||
    typeof value.repository !== "string" ||
    typeof value.revision !== "string"
  ) {
    throw new Error(
      "Repository input requires provider, repository, and revision",
    );
  }
  return input as RepositoryInput;
}

function unavailable(id: string): Error {
  return new Error(`Attachment unavailable: ${id}`);
}

function pathComponent(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value !== "." &&
    value !== ".." &&
    !/[\\/\0]/.test(value)
  );
}

function attachmentInput(input: RunInput): AttachmentInput {
  const value = input as unknown as Record<string, unknown>;
  const id = typeof value.id === "string" ? value.id : "unknown";
  if (
    input.type !== "attachment" ||
    !pathComponent(value.id) ||
    typeof value.roomId !== "string" ||
    !pathComponent(value.filename) ||
    typeof value.byteSize !== "number" ||
    !Number.isSafeInteger(value.byteSize) ||
    value.byteSize < 0 ||
    typeof value.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.sha256)
  ) {
    throw unavailable(id);
  }
  return input as AttachmentInput;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function git(
  directory: string,
  args: readonly string[],
): Promise<string> {
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

async function initializeGitWorkspace(
  directory: string,
  branch: string,
): Promise<string> {
  if (await Bun.file(join(directory, ".git", "HEAD")).exists()) {
    await git(directory, ["checkout", "-B", branch]);
    await git(directory, ["config", "user.name", "Colony Agent"]);
    await git(directory, ["config", "user.email", "agent@colony.local"]);
    await git(directory, ["config", "commit.gpgsign", "false"]);
    await addWorkspaceExcludes(directory);
    return (await git(directory, ["rev-list", "--max-parents=0", "HEAD"])).trim();
  }
  await git(directory, ["init", "--initial-branch", branch]);
  await git(directory, ["config", "user.name", "Colony Agent"]);
  await git(directory, ["config", "user.email", "agent@colony.local"]);
  await git(directory, ["config", "commit.gpgsign", "false"]);
  await addWorkspaceExcludes(directory);
  await git(directory, ["add", "--all"]);
  await git(directory, ["commit", "--quiet", "--message", "Colony base"]);
  return (await git(directory, ["rev-parse", "HEAD"])).trim();
}

async function addWorkspaceExcludes(directory: string): Promise<void> {
  await appendFile(
    join(directory, ".git", "info", "exclude"),
    skillGitExcludeLines(),
  );
}

async function stageAttachment(
  directory: string,
  input: AttachmentInput,
  source: AttachmentSource | undefined,
): Promise<void> {
  try {
    const attachment = await source?.read(input.id);
    if (
      !attachment ||
      attachment.roomId !== input.roomId ||
      attachment.filename !== input.filename ||
      attachment.byteSize !== input.byteSize ||
      attachment.sha256 !== input.sha256 ||
      !(attachment.bytes instanceof Uint8Array) ||
      attachment.bytes.byteLength !== input.byteSize ||
      sha256(attachment.bytes) !== input.sha256
    ) {
      throw unavailable(input.id);
    }
    const path = join(
      directory,
      ".sweat",
      "attachments",
      input.id,
      input.filename,
    );
    await mkdir(join(directory, ".sweat", "attachments", input.id), {
      recursive: true,
    });
    await writeFile(path, attachment.bytes);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === `Attachment unavailable: ${input.id}`
    )
      throw error;
    throw unavailable(input.id);
  }
}

/**
 * Every run's workspace is a sibling under one root, not loose in the system
 * temp directory. A smolvm golden mounts this root once and each of its clones
 * binds its own directory out of it, which only works if they share a parent —
 * and mounting the temp directory itself would hand every sandbox the cached
 * sandbox image archives that also live there.
 */
export const workspacesRoot = join(tmpdir(), "colony-workspaces");

async function defaultWorkspaceDirectory(): Promise<string> {
  await mkdir(workspacesRoot, { recursive: true });
  return mkdtemp(join(workspacesRoot, "run-"));
}

export function createRepositoryWorkspaceProvisioner(
  options: WorkspaceProvisionerOptions,
): InputProvisioner<WorkspaceInput> {
  const sources = new Map(
    options.sources.map((source) => [source.provider, source]),
  );
  const createDirectory = options.createDirectory ?? defaultWorkspaceDirectory;
  const removeDirectory =
    options.removeDirectory ??
    ((directory) => rm(directory, { force: true, recursive: true }));

  return {
    async prepare(inputs, context) {
      const repositories: RepositoryInput[] = [];
      const attachments: AttachmentInput[] = [];
      const attachmentIds = new Set<string>();
      for (const input of inputs) {
        if (input.type === "repository")
          repositories.push(repositoryInput(input));
        else if (input.type === "attachment") {
          const attachment = attachmentInput(input);
          if (attachmentIds.has(attachment.id))
            throw unavailable(attachment.id);
          attachmentIds.add(attachment.id);
          attachments.push(attachment);
        } else {
          throw new Error("Unsupported workspace input");
        }
      }
      if (repositories.length > 1)
        throw new Error("A run currently supports one repository workspace");

      const skillPackages =
        context.agentDefinitionId && options.skillSource
          ? await options.skillSource.listForAgent(context.agentDefinitionId)
          : [];
      const skillLayout =
        context.agentDefinitionId && options.skillSource
          ? options.skillSource.layoutForAgent(context.agentDefinitionId)
          : undefined;
      const repository = repositories[0];
      const source = repository && sources.get(repository.provider);
      if (repository && !source)
        throw new Error(
          `Unsupported repository provider: ${repository.provider}`,
        );
      const path = await createDirectory();
      try {
        const checkout = repository
          ? await source!.checkout(repository, path)
          : undefined;
        if (attachments.length)
          await rm(join(path, ".sweat"), { force: true, recursive: true });
        const branch = `sweat/${context.runId}`;
        const baseCommit = repository
          ? await initializeGitWorkspace(path, branch)
          : undefined;
        for (const attachment of attachments) {
          await stageAttachment(path, attachment, options.attachmentSource);
        }
        if (skillPackages.length && skillLayout) {
          await stageSkillPackages(path, skillLayout, skillPackages);
        }
        return {
          workspace: {
            path,
            ...(repository && checkout && baseCommit
              ? {
                  git: {
                    repository: repository.repository,
                    baseRevision: checkout.revision,
                    baseCommit,
                    branch,
                  },
                }
              : {}),
            dispose: () => removeDirectory(path),
          },
        };
      } catch (error) {
        try {
          await removeDirectory(path);
        } catch {
          // Preserve the preparation error; the run must not expose cleanup details.
        }
        throw error;
      }
    },
  };
}

export const createWorkspaceProvisioner = createRepositoryWorkspaceProvisioner;
