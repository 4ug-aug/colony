import { expect, test } from "bun:test";
import { softwareEngineerRole } from "./software-engineer";

test("the software engineer requests scoped Linear issue tools", () => {
  expect(softwareEngineerRole).toMatchObject({
    id: "software-engineer",
    requestedCapabilities: [
      {
        id: "linear.issues",
        tools: [
          "linear.getIssue",
          "linear.searchIssues",
          "linear.createComment",
          "linear.updateIssue",
        ],
      },
    ],
  });
});
