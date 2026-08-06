import { describe, expect, test } from "bun:test";
import {
  parseSkillFrontmatter,
  validateSkillPackageFiles,
} from "./package";

describe("skill packages", () => {
  test("parses frontmatter name and description", () => {
    expect(
      parseSkillFrontmatter(`---
name: brand-guidelines
description: Apply brand rules to documents.
---

# Brand
`),
    ).toEqual({
      name: "brand-guidelines",
      description: "Apply brand rules to documents.",
    });
  });

  test("accepts markdown-only packages with references", () => {
    const result = validateSkillPackageFiles([
      {
        path: "SKILL.md",
        bytes: new TextEncoder().encode(`---
name: summarize
description: Summarize changes.
---

Read references/format.md.
`),
      },
      {
        path: "references/format.md",
        bytes: new TextEncoder().encode("# Format\n"),
      },
    ]);
    expect(result.frontmatter.name).toBe("summarize");
    expect(result.files).toHaveLength(2);
  });

  test("rejects scripts directories and non-markdown files", () => {
    expect(() =>
      validateSkillPackageFiles([
        {
          path: "SKILL.md",
          bytes: new TextEncoder().encode(`---
name: bad
description: Bad.
---
`),
        },
        {
          path: "scripts/run.sh",
          bytes: new TextEncoder().encode("echo hi\n"),
        },
      ]),
    ).toThrow(/scripts/);

    expect(() =>
      validateSkillPackageFiles([
        {
          path: "SKILL.md",
          bytes: new TextEncoder().encode(`---
name: bad
description: Bad.
---
`),
        },
        {
          path: "notes.txt",
          bytes: new TextEncoder().encode("nope\n"),
        },
      ]),
    ).toThrow(/markdown/);
  });
});
