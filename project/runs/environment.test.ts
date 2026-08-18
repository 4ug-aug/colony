import { expect, test } from "bun:test";
import { instructionsForEnvironment } from "./environment";

test("every person is told the sandbox is theirs to use", () => {
  for (const git of [
    undefined,
    {
      repository: "acme/app",
      baseRevision: "main",
      baseCommit: "abc123",
      branch: "sweat/run",
    },
  ]) {
    expect(instructionsForEnvironment(git)).toContain("disposable sandbox");
  }
});

test("only a person holding a checkout is told about a repository", () => {
  const result = instructionsForEnvironment(undefined);
  expect(result).not.toContain("/work");
  expect(result).not.toContain("Git repository");
});

test("a checkout is described by its own facts, not a role flag", () => {
  const result = instructionsForEnvironment({
    repository: "acme/app",
    baseRevision: "main",
    baseCommit: "abc123",
    branch: "sweat/run",
  });
  expect(result).toContain("acme/app");
  expect(result).toContain("upstream commit main");
  expect(result).toContain("local branch sweat/run");
  expect(result).toContain("committed as abc123");
});
