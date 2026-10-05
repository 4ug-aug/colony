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

test("chat invocation allows follow-up turns and is not a Room", () => {
  const result = instructionsForInvocation("Be helpful.", {
    chatId: "chat-1",
    agentDefinitionId: "antboy",
  });
  expect(result).toContain("Be helpful.");
  expect(result).toContain("Chat");
  expect(result).toContain("Follow-up turns");
  expect(result).not.toContain("working from a Room");
  expect(result).not.toContain("Oneshot");
});

test("chamber invocation is a private conversation where other agents may consult", () => {
  const result = instructionsForInvocation("Be helpful.", {
    roomId: "chamber-1",
    chamber: true,
    agentDefinitionId: "dj-master",
  });
  expect(result).toContain("Be helpful.");
  expect(result).toContain("Chamber");
  expect(result).toContain("Consultation");
  expect(result).not.toContain("working from a Room");
});

test("an agent is told its own name, so it knows which messages are its own", () => {
  const result = instructionsForInvocation(
    "Be helpful.",
    { roomId: "room-1" },
    "DJ Master",
  );
  expect(result).toStartWith(
    "Your name is DJ Master. Messages you wrote appear under that name.",
  );
  expect(result).toContain("Be helpful.");
});
