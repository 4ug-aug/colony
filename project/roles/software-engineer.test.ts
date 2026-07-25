import { expect, test } from "bun:test";
import { softwareEngineerRole } from "./software-engineer";

test("the software engineer requests scoped issue and pull request tools", () => {
  expect(softwareEngineerRole.id).toBe("software-engineer");
  expect(softwareEngineerRole.requestedCapabilities).toContainEqual({
    id: "linear.issues",
    tools: [
      "linear.getIssue",
      "linear.searchIssues",
      "linear.createComment",
      "linear.updateIssue",
    ],
  });
  expect(softwareEngineerRole.requestedCapabilities).toContainEqual({
    id: "github.pull-requests",
    tools: ["github.createPullRequest"],
  });
});
