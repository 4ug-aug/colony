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
    id: "asana.tasks",
    tools: [
      "asana.get_project",
      "asana.create_task",
      "asana.list_tasks",
      "asana.get_task",
      "asana.get_task_comments",
      "asana.set_task_completion",
      "asana.add_task_comment",
    ],
  });
  expect(softwareEngineerRole.requestedCapabilities).toContainEqual({
    id: "github.pull-requests",
    tools: [
      "github.create_pull_request",
      "github.wait_for_pull_request_checks",
    ],
  });
  expect(softwareEngineerRole.instructions).toContain(
    "Make at most two repair attempts",
  );
  expect(softwareEngineerRole.instructions).toContain(
    "Do not use it to deliver your final result",
  );
});
