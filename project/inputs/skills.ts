import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  cursorSkillRelativePath,
  openaiSkillRelativePath,
  type SkillPackageFile,
} from "../skills/package";

export type StagedSkillPackage = {
  name: string;
  files: readonly SkillPackageFile[];
};

export type SkillRuntimeLayout = "cursor" | "openai-agents";

export function skillRelativeRoot(
  layout: SkillRuntimeLayout,
  skillName: string,
): string {
  return layout === "cursor"
    ? cursorSkillRelativePath(skillName)
    : openaiSkillRelativePath(skillName);
}

export async function stageSkillPackages(
  workspacePath: string,
  layout: SkillRuntimeLayout,
  packages: readonly StagedSkillPackage[],
): Promise<void> {
  for (const skill of packages) {
    const root = join(workspacePath, skillRelativeRoot(layout, skill.name));
    for (const file of skill.files) {
      const target = join(root, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, file.bytes);
    }
  }
}

export function skillGitExcludeLines(): string {
  return "/.sweat/\n/.cursor/skills/\n/.agents/skills/\n";
}
