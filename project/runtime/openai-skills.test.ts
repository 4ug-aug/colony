import { expect, test } from "bun:test";
import { Manifest } from "@openai/agents/sandbox";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openaiSkillsCapability } from "./openai-skills";

test("openai skills capability lazy-loads staged skills without inlining bodies", async () => {
  const root = await mkdtemp(join(tmpdir(), "sweat-openai-skills-"));
  const skillDir = join(root, "summarize");
  await mkdir(skillDir, { recursive: true });
  await writeFile(
    join(skillDir, "SKILL.md"),
    `---
name: summarize
description: Summarize repository changes.
---

# Secret body that must not appear in the index
`,
  );

  try {
    const capability = openaiSkillsCapability(root);
    expect(capability.type).toBe("skills");
    expect(capability.skillsPath).toBe(".agents/skills");
    expect(capability.lazyFrom).toBeDefined();

    const text = await capability.instructions(
      new Manifest({
        entries: {},
        extraPathGrants: [{ path: root, readOnly: true }],
      }),
    );
    expect(text).toContain("summarize");
    expect(text).toContain("Summarize repository changes.");
    expect(text).toContain("load_skill");
    expect(text).not.toContain("Secret body that must not appear in the index");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
