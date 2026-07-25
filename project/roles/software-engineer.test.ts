import { expect, test } from "bun:test";
import { softwareEngineerRole } from "./software-engineer";

test("the software engineer requests scoped issue and pull request tools", () => {
  expect(softwareEngineerRole.id).toBe("software-engineer");
  expect(softwareEngineerRole.requestedCapabilities).toContainEqual({
    id: "linear.issues",
    tools: [
      "get_issue",
      "list_issues",
      "save_comment",
      "save_issue",
    ],
  });
  expect(softwareEngineerRole.requestedCapabilities).toContainEqual({
    id: "github.pull-requests",
    tools: ["github.createPullRequest"],
  });
});
