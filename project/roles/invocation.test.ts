import { expect, test } from "bun:test";
import { instructionsForInvocation } from "./invocation";

test("oneshot invocation appends single-output instructions", () => {
  const result = instructionsForInvocation("Be helpful.", {
    oneshotId: "oneshot-1",
    agentDefinitionId: "antboy",
  });
  expect(result).toContain("Be helpful.");
  expect(result).toContain("Oneshot");
  expect(result).toContain("single bounded Task");
  expect(result).not.toContain("working from a Room");
});

test("oneshot marker wins over room when both present", () => {
  // Grant contexts should not combine these; if they did, oneshot must win.
  const result = instructionsForInvocation("Base.", {
    oneshotId: "oneshot-1",
    roomId: "room-1",
  });
  expect(result).toContain("Oneshot");
  expect(result).not.toContain("working from a Room");
});

test("grill invocation names Colony Doc tools, not Outline", () => {
  const result = instructionsForInvocation("Base.", { grillId: "grill-1" });
  expect(result).toContain("workspace.list_docs");
  expect(result).toContain("workspace.get_doc");
  expect(result).not.toContain("outline.");
});
