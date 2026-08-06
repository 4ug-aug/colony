import { createHash } from "node:crypto";

export type SkillFrontmatter = {
  name: string;
  description: string;
};

export type SkillPackageFile = {
  path: string;
  bytes: Uint8Array;
};

const SKILL_NAME = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const MARKDOWN_PATH = /^(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+\.md$/;
const FORBIDDEN_SEGMENTS = new Set(["scripts"]);

export function parseSkillFrontmatter(markdown: string): SkillFrontmatter {
  const lines = markdown.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new Error("SKILL.md must start with YAML frontmatter");
  }
  const fields: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") break;
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    fields[match[1]!] = match[2]!.trim().replace(/^["']|["']$/g, "");
  }
  if (i >= lines.length || lines[i]!.trim() !== "---") {
    throw new Error("SKILL.md frontmatter is not closed");
  }
  const name = fields.name?.trim();
  const description = fields.description?.trim();
  if (!name || !SKILL_NAME.test(name)) {
    throw new Error(
      "Skill name must be 1-64 lowercase letters, numbers, and hyphens",
    );
  }
  if (!description) {
    throw new Error("Skill description is required");
  }
  if (description.length > 1024) {
    throw new Error("Skill description must be at most 1024 characters");
  }
  return { name, description };
}

function normalizePackagePath(path: string): string {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`Invalid skill package path: ${path}`);
  }
  return normalized;
}

export function validateSkillPackageFiles(
  files: readonly SkillPackageFile[],
): {
  frontmatter: SkillFrontmatter;
  files: SkillPackageFile[];
  contentHash: string;
} {
  if (!files.length) throw new Error("Skill package is empty");

  const byPath = new Map<string, SkillPackageFile>();
  for (const file of files) {
    const path = normalizePackagePath(file.path);
    const segments = path.split("/");
    if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment.toLowerCase()))) {
      throw new Error("Skill packages must not include scripts/");
    }
    if (!MARKDOWN_PATH.test(path)) {
      throw new Error(`Skill packages may only include markdown files: ${path}`);
    }
    if (byPath.has(path)) throw new Error(`Duplicate skill package path: ${path}`);
    byPath.set(path, { path, bytes: file.bytes });
  }

  const skillMd = byPath.get("SKILL.md");
  if (!skillMd) throw new Error("Skill package requires SKILL.md at the package root");

  const frontmatter = parseSkillFrontmatter(
    new TextDecoder().decode(skillMd.bytes),
  );

  const sorted = [...byPath.values()].sort((a, b) =>
    a.path.localeCompare(b.path),
  );
  const hash = createHash("sha256");
  for (const file of sorted) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(file.bytes);
    hash.update("\0");
  }
  return {
    frontmatter,
    files: sorted,
    contentHash: hash.digest("hex"),
  };
}

export function cursorSkillRelativePath(skillName: string): string {
  return `.cursor/skills/${skillName}`;
}

export function openaiSkillRelativePath(skillName: string): string {
  return `.agents/skills/${skillName}`;
}
