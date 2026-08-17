import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createRepositoryWorkspaceProvisioner,
  type AttachmentInput,
  type AttachmentSource,
} from "./repository";

const hash = (bytes: Uint8Array): string =>
  createHash("sha256").update(bytes).digest("hex");

function attachment(
  id: string,
  filename: string,
  text: string,
  roomId = "room-1",
): AttachmentInput {
  const bytes = new TextEncoder().encode(text);
  return {
    type: "attachment",
    id,
    roomId,
    filename,
    byteSize: bytes.byteLength,
    sha256: hash(bytes),
  };
}

function source(
  values: Record<string, { input: AttachmentInput; bytes: Uint8Array }>,
): AttachmentSource {
  return {
    async read(id) {
      const value = values[id];
      return value && { ...value.input, bytes: Uint8Array.from(value.bytes) };
    },
  };
}

async function git(
  directory: string,
  args: string[],
): Promise<{ exitCode: number; stdout: string }> {
  const process = Bun.spawn(["git", "-C", directory, ...args], {
    env: { PATH: Bun.env.PATH },
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    exitCode: await process.exited,
    stdout: await new Response(process.stdout).text(),
  };
}

test("a repository input is checked out into a disposable workspace", async () => {
  const calls: unknown[] = [];
  let removed: string | undefined;
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [
      {
        provider: "github",
        checkout: async (input, directory) => {
          calls.push({ input, directory });
          await Bun.write(join(directory, "README.md"), "ready\n");
          return { revision: "abc123" };
        },
      },
    ],
    createDirectory: async () => mkdtemp(join(tmpdir(), "sweat-run-")),
    removeDirectory: async (directory) => {
      removed = directory;
      await rm(directory, { force: true, recursive: true });
    },
  });

  const prepared = await provisioner.prepare(
    [
      {
        type: "repository",
        provider: "github",
        repository: "acme/product",
        revision: "main",
      },
    ],
    { runId: "run-1" },
  );

  expect(calls[0]).toMatchObject({
    input: {
      type: "repository",
      provider: "github",
      repository: "acme/product",
      revision: "main",
    },
  });
  expect(prepared.workspace?.git).toMatchObject({
    repository: "acme/product",
    baseRevision: "abc123",
    branch: "sweat/run-1",
  });
  await prepared.workspace?.dispose();
  expect(removed).toBe(prepared.workspace?.path);
});

test("prepare keeps checkout git history and uses the line commit as baseCommit", async () => {
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [
      {
        provider: "github",
        checkout: async (_input, directory) => {
          await Bun.write(join(directory, "README.md"), "line\n");
          await git(directory, ["init", "--initial-branch", "line"]);
          await git(directory, ["config", "user.name", "Colony Agent"]);
          await git(directory, ["config", "user.email", "agent@colony.local"]);
          await git(directory, ["config", "commit.gpgsign", "false"]);
          await git(directory, ["add", "--all"]);
          await git(directory, ["commit", "--quiet", "--message", "Colony line"]);
          await Bun.write(join(directory, "child.ts"), "child\n");
          await git(directory, ["add", "--all"]);
          await git(directory, ["commit", "--quiet", "--message", "Child head"]);
          return { revision: "line-sha" };
        },
      },
    ],
    createDirectory: async () => mkdtemp(join(tmpdir(), "sweat-run-")),
    removeDirectory: async (directory) =>
      rm(directory, { force: true, recursive: true }),
  });

  const prepared = await provisioner.prepare(
    [
      {
        type: "repository",
        provider: "github",
        repository: "acme/product",
        revision: "sweat/issue/COL-1",
        mergeRevisions: ["sweat/child-1"],
      },
    ],
    { runId: "run-integrate" },
  );
  const workspace = prepared.workspace!;
  const root = (await git(workspace.path, ["rev-list", "--max-parents=0", "HEAD"]))
    .stdout.trim();
  const head = (await git(workspace.path, ["rev-parse", "HEAD"])).stdout.trim();
  expect(workspace.git).toMatchObject({
    repository: "acme/product",
    baseRevision: "line-sha",
    baseCommit: root,
    branch: "sweat/run-integrate",
  });
  expect(head).not.toBe(root);
  expect(
    (await git(workspace.path, ["ls-tree", "--name-only", "HEAD"])).stdout,
  ).toContain("child.ts");
  expect(
    (await git(workspace.path, ["branch", "--show-current"])).stdout.trim(),
  ).toBe("sweat/run-integrate");
  await workspace.dispose();
});

test("a repository provisioner validates its own input fields", async () => {
  const provisioner = createRepositoryWorkspaceProvisioner({ sources: [] });

  await expect(
    provisioner.prepare(
      [
        {
          type: "repository",
          provider: "github",
          repository: "acme/product",
        },
      ],
      { runId: "run-1" },
    ),
  ).rejects.toThrow("Repository input requires");
});

test("attachments create a clean disposable workspace at their public runtime paths", async () => {
  const first = attachment("attachment-1", "notes.txt", "durable notes\n");
  const second = attachment("attachment-2", "notes.txt", "other notes\n");
  const durable = await mkdtemp(join(tmpdir(), "sweat-attachment-source-"));
  const original = join(durable, "original.txt");
  await writeFile(original, "durable notes\n");
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [],
    attachmentSource: source({
      [first.id]: {
        input: first,
        bytes: new Uint8Array(await readFile(original)),
      },
      [second.id]: {
        input: second,
        bytes: new TextEncoder().encode("other notes\n"),
      },
    }),
  });

  try {
    const prepared = await provisioner.prepare([first, second], {
      runId: "run-attachments",
    });
    const workspace = prepared.workspace!;
    const firstPath = join(
      workspace.path,
      ".sweat",
      "attachments",
      first.id,
      first.filename,
    );
    const secondPath = join(
      workspace.path,
      ".sweat",
      "attachments",
      second.id,
      second.filename,
    );
    expect(await Bun.file(firstPath).text()).toBe("durable notes\n");
    expect(await Bun.file(secondPath).text()).toBe("other notes\n");
    expect(firstPath).not.toBe(secondPath);
    await writeFile(firstPath, "changed\n");
    expect(await Bun.file(original).text()).toBe("durable notes\n");
    await workspace.dispose();
    expect(await Bun.file(workspace.path).exists()).toBe(false);
  } finally {
    await rm(durable, { force: true, recursive: true });
  }
});

test("the repository is prepared before attachments and staged copies remain outside git", async () => {
  const input = attachment("attachment-1", "brief.md", "hello\n");
  const events: string[] = [];
  const outside = await mkdtemp(join(tmpdir(), "sweat-attachment-outside-"));
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [
      {
        provider: "github",
        checkout: async (_input, directory) => {
          events.push("checkout");
          await writeFile(join(directory, "README.md"), "repository\n");
          await symlink(outside, join(directory, ".sweat"));
          return { revision: "abc123" };
        },
      },
    ],
    attachmentSource: {
      async read(id) {
        events.push("attachment");
        return (
          id === input.id && {
            ...input,
            bytes: new TextEncoder().encode("hello\n"),
          }
        );
      },
    },
  });

  const prepared = await provisioner.prepare(
    [
      input,
      {
        type: "repository",
        provider: "github",
        repository: "acme/product",
        revision: "main",
      },
    ],
    { runId: "run-repository-attachment" },
  );
  const workspace = prepared.workspace!;
  expect(events).toEqual(["checkout", "attachment"]);
  expect(workspace.git).toMatchObject({
    repository: "acme/product",
    baseRevision: "abc123",
  });
  expect(
    await Bun.file(
      join(workspace.path, ".sweat", "attachments", input.id, input.filename),
    ).text(),
  ).toBe("hello\n");
  expect(
    await Bun.file(
      join(outside, "attachments", input.id, input.filename),
    ).exists(),
  ).toBe(false);
  expect((await git(workspace.path, ["status", "--porcelain"])).stdout).toBe(
    "",
  );
  expect(
    (
      await git(workspace.path, [
        "check-ignore",
        "-q",
        ".sweat/attachments/attachment-1/brief.md",
      ])
    ).exitCode,
  ).toBe(0);
  await workspace.dispose();
  await rm(outside, { force: true, recursive: true });
});

test("attached skills stage into the runtime layout and stay outside git", async () => {
  const calls: Array<{ directory: string }> = [];
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [
      {
        provider: "github",
        async checkout(_input, directory) {
          calls.push({ directory });
          await Bun.write(join(directory, "README.md"), "# product\n");
          return { revision: "abc123" };
        },
      },
    ],
    skillSource: {
      layoutForAgent: () => "cursor",
      listForAgent: async () => [
        {
          name: "summarize",
          files: [
            {
              path: "SKILL.md",
              bytes: new TextEncoder().encode(`---
name: summarize
description: Summarize.
---

Body
`),
            },
          ],
        },
      ],
    },
    createDirectory: async () => mkdtemp(join(tmpdir(), "sweat-run-")),
    removeDirectory: async (directory) =>
      rm(directory, { force: true, recursive: true }),
  });

  const prepared = await provisioner.prepare(
    [
      {
        type: "repository",
        provider: "github",
        repository: "acme/product",
        revision: "main",
      },
    ],
    { runId: "run-skills", agentDefinitionId: "software-engineer" },
  );
  const workspace = prepared.workspace!;
  expect(
    await Bun.file(
      join(workspace.path, ".cursor/skills/summarize/SKILL.md"),
    ).text(),
  ).toContain("name: summarize");
  expect((await git(workspace.path, ["status", "--porcelain"])).stdout).toBe(
    "",
  );
  expect(
    (
      await git(workspace.path, [
        "check-ignore",
        "-q",
        ".cursor/skills/summarize/SKILL.md",
      ])
    ).exitCode,
  ).toBe(0);
  await workspace.dispose();
});

test("skills alone still provision a workspace for openai-agents layout", async () => {
  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [],
    skillSource: {
      layoutForAgent: () => "openai-agents",
      listForAgent: async () => [
        {
          name: "issue-writer",
          files: [
            {
              path: "SKILL.md",
              bytes: new TextEncoder().encode(`---
name: issue-writer
description: Write issues.
---

Body
`),
            },
          ],
        },
      ],
    },
    createDirectory: async () => mkdtemp(join(tmpdir(), "sweat-run-")),
    removeDirectory: async (directory) =>
      rm(directory, { force: true, recursive: true }),
  });

  const prepared = await provisioner.prepare([], {
    runId: "run-skills-only",
    agentDefinitionId: "antboy",
  });
  const workspace = prepared.workspace!;
  expect(
    await Bun.file(
      join(workspace.path, ".agents/skills/issue-writer/SKILL.md"),
    ).text(),
  ).toContain("name: issue-writer");
  await workspace.dispose();
});

test("unavailable attachments fail without leaking a temporary workspace", async () => {
  const input = attachment("attachment-1", "notes.txt", "expected\n");
  const expected = `Attachment unavailable: ${input.id}`;
  const cases: Array<{ name: string; read: AttachmentSource["read"] }> = [
    { name: "missing", read: async () => undefined },
    {
      name: "wrong room",
      read: async () => ({
        ...input,
        roomId: "other-room",
        bytes: new TextEncoder().encode("expected\n"),
      }),
    },
    {
      name: "altered metadata",
      read: async () => ({
        ...input,
        filename: "altered.txt",
        bytes: new TextEncoder().encode("expected\n"),
      }),
    },
    {
      name: "checksum mismatch",
      read: async () => ({
        ...input,
        bytes: new TextEncoder().encode("tampered\n"),
      }),
    },
  ];

  for (const failure of cases) {
    const directories: string[] = [];
    const provisioner = createRepositoryWorkspaceProvisioner({
      sources: [],
      attachmentSource: { read: failure.read },
      createDirectory: async () => {
        const directory = await mkdtemp(join(tmpdir(), "sweat-run-failure-"));
        directories.push(directory);
        return directory;
      },
    });
    await expect(
      provisioner.prepare([input], { runId: failure.name }),
    ).rejects.toThrow(expected);
    for (const directory of directories)
      expect(await Bun.file(directory).exists()).toBe(false);
  }

  const provisioner = createRepositoryWorkspaceProvisioner({
    sources: [],
    attachmentSource: { read: async () => undefined },
  });
  await expect(
    provisioner.prepare([input, input], { runId: "duplicate" }),
  ).rejects.toThrow(expected);
});
