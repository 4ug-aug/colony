import { skills, type Skills } from "@openai/agents/sandbox";
import { localDirLazySkillSource } from "@openai/agents/sandbox/local";

/**
 * Wire the OpenAI Agents SDK skills capability against a staged
 * `.agents/skills` tree. Discovery and progressive disclosure (load_skill)
 * stay inside the SDK — Colony only points at the staged root.
 */
export function openaiSkillsCapability(skillsRoot: string): Skills {
  return skills({
    lazyFrom: localDirLazySkillSource({ src: skillsRoot }),
    skillsPath: ".agents/skills",
  });
}
