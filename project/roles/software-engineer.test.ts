import { expect, test } from "bun:test";
import { softwareEngineerRole } from "./software-engineer";

test("the software engineer requests scoped issue and pull request tools", () => {
  expect(softwareEngineerRole.id).toBe("software-engineer");
  expect(softwareEngineerRole.requestedCapabilities).toContainEqual({
    id: "linear.issues",
    tools: [
      "linear.get_issue",
      "linear.list_issues",
      "linear.save_comment",
      "linear.save_issue",
    ],
  });
  expect(softwareEngineerRole.requestedCapabilities).toContainEqual({
    id: "github.pull-requests",
    tools: ["github.create_pull_request"],
  });
});
