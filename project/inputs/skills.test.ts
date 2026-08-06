import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageSkillPackages } from "./skills";

test("stages skill packages into runtime-native layouts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sweat-stage-skills-"));
  const files = [
    {
      path: "SKILL.md",
      bytes: new TextEncoder().encode(`---
name: summarize
description: Summarize.
---

Body
`),
    },
  ];

  await stageSkillPackages(directory, "cursor", [
    { name: "summarize", files },
  ]);
  await stageSkillPackages(directory, "openai-agents", [
    { name: "summarize", files },
  ]);

  expect(
    await readFile(
      join(directory, ".cursor/skills/summarize/SKILL.md"),
      "utf8",
    ),
  ).toContain("name: summarize");
  expect(
    await readFile(
      join(directory, ".agents/skills/summarize/SKILL.md"),
      "utf8",
    ),
  ).toContain("name: summarize");

  await rm(directory, { force: true, recursive: true });
});
