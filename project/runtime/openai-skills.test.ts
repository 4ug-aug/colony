import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openaiSkillInstructions } from "./openai-skills";

test("openai skill instructions list staged markdown skills without inlining bodies", async () => {
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

  const text = await openaiSkillInstructions(root);
  expect(text).toContain("summarize");
  expect(text).toContain("Summarize repository changes.");
  expect(text).toContain(".agents/skills/summarize");
  expect(text).not.toContain("Secret body that must not appear in the index");

  await rm(root, { force: true, recursive: true });
});
