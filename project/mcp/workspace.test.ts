import { expect, test } from "bun:test";
import {
  createWorkspaceMcpUpstream,
  formatWorkspaceTranscript,
  type WorkspaceMessage,
  type WorkspaceRoomPort,
} from "./workspace";

// 2026-07-27T14:32:00Z
const FIXED_NOW = Date.UTC(2026, 6, 27, 14, 32, 0);

const fixedMessages: WorkspaceMessage[] = [
  { author: { kind: "user", id: "u1", name: "Alice" }, text: "hello", createdAt: FIXED_NOW - 1000 * 60 * 60 * 24 },
  { author: { kind: "user", id: "u1", name: "Alice" }, text: "world", createdAt: FIXED_NOW - 1000 * 60 * 5 },
  { author: { kind: "agent", id: "a1", name: "Bot" }, text: "hi there", createdAt: FIXED_NOW - 1000 * 30 },
];

function makePort(roomId: string, messages: WorkspaceMessage[]): WorkspaceRoomPort & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    listMessages(id) {
      calls.push({ op: "list", id });
      return messages;
    },
    postMessage(input) {
      calls.push({ op: "post", input });
    },
  };
}

test("listTools() returns workspace.read_messages and workspace.post_message", async () => {
  const upstream = createWorkspaceMcpUpstream({
    port: makePort("room-1", []),
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
  });
  const tools = await upstream.listTools();
  expect(tools.map((t) => t.name)).toEqual(["workspace.read_messages", "workspace.post_message"]);
});

test("read_messages returns a chronological, compact transcript", async () => {
  const port = makePort("room-1", fixedMessages);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
    now: () => FIXED_NOW,
  });
  const result = await upstream.callTool("workspace.read_messages", {}) as { content: { type: string; text: string }[] };
  expect(result.content).toEqual([{
    type: "text",
    text: "[Alice · user · yesterday]\nhello\n\n[Alice · user · 5 minutes ago]\nworld\n\n[Bot · agent · 30 seconds ago]\nhi there",
  }]);
});

test("formatWorkspaceTranscript handles an empty room", () => {
  expect(formatWorkspaceTranscript([], FIXED_NOW)).toBe("No workspace messages.");
});

test("read_messages respects limit", async () => {
  const port = makePort("room-1", fixedMessages);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
    now: () => FIXED_NOW,
  });
  const result = await upstream.callTool("workspace.read_messages", { limit: 2 }) as { content: { text: string }[] };
  expect(result.content[0].text).toBe(formatWorkspaceTranscript(fixedMessages.slice(-2), FIXED_NOW));
});

test("post_message calls port with bound roomId and agent-kind author", async () => {
  const port = makePort("room-1", []);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot", image: "https://example.com/bot.png" },
  });
  const result = await upstream.callTool("workspace.post_message", { text: "hello room" });
  expect(result).toEqual({ posted: true });
  expect(port.calls).toContainEqual({
    op: "post",
    input: {
      roomId: "room-1",
      author: { kind: "agent", id: "agent-1", name: "TestBot", image: "https://example.com/bot.png" },
      text: "hello room",
    },
  });
});

test("post_message with empty text throws", async () => {
  const port = makePort("room-1", []);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
  });
  await expect(upstream.callTool("workspace.post_message", { text: "" })).rejects.toThrow(
    "A non-empty text is required",
  );
});

test("post_message with whitespace-only text throws", async () => {
  const port = makePort("room-1", []);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
  });
  await expect(upstream.callTool("workspace.post_message", { text: "   " })).rejects.toThrow(
    "A non-empty text is required",
  );
});

test("room binding is not caller-controlled: bogus roomId in args is ignored for read_messages", async () => {
  const port = makePort("room-1", fixedMessages);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
  });
  // Pass a bogus roomId in args — the upstream must ignore it and use options.roomId
  await upstream.callTool("workspace.read_messages", { roomId: "bogus-room" } as Record<string, unknown>);
  expect(port.calls).toEqual([{ op: "list", id: "room-1" }]);
});

test("room binding is not caller-controlled: bogus roomId in args is ignored for post_message", async () => {
  const port = makePort("room-1", []);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
  });
  await upstream.callTool("workspace.post_message", { text: "hi", roomId: "bogus-room" } as Record<string, unknown>);
  const postCall = port.calls.find((c) => (c as { op: string }).op === "post") as { op: string; input: { roomId: string } };
  expect(postCall.input.roomId).toBe("room-1");
});

test("unknown tool throws", async () => {
  const upstream = createWorkspaceMcpUpstream({
    port: makePort("room-1", []),
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
  });
  await expect(upstream.callTool("workspace.unknown_tool", {})).rejects.toThrow(
    "Unknown workspace tool: workspace.unknown_tool",
  );
});
