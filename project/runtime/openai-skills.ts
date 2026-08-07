import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Manifest, skills } from "@openai/agents/sandbox";
import { parseSkillFrontmatter } from "../skills/package";

/**
 * Build OpenAI Agents SDK skill discovery instructions from a staged
 * `.agents/skills` tree. Bodies stay on disk for progressive disclosure; the
 * agent opens them with the `shell` tool.
 */
export async function openaiSkillInstructions(
  skillsRoot: string,
): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(skillsRoot, { withFileTypes: true });
  } catch {
    return undefined;
  }

  const descriptors: {
    name: string;
    description: string;
    content: string;
  }[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      const markdown = await readFile(
        join(skillsRoot, entry.name, "SKILL.md"),
        "utf8",
      );
      const frontmatter = parseSkillFrontmatter(markdown);
      descriptors.push({
        name: frontmatter.name,
        description: frontmatter.description,
        content: markdown,
      });
    } catch {
      // Skip incomplete skill directories.
    }
  }

  if (!descriptors.length) return undefined;

  const capability = skills({
    skills: descriptors,
    skillsPath: ".agents/skills",
  });
  const text = await capability.instructions(new Manifest({ entries: {} }));
  return text ?? undefined;
}
