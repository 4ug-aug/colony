import { expect, test } from "bun:test";
import {
  createWorkspaceMcpUpstream,
  formatFriendlyTime,
  formatRelativeTime,
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

const withReadableTime = (messages: WorkspaceMessage[]) =>
  messages.map((message) => ({
    ...message,
    time: formatFriendlyTime(message.createdAt),
    relativeTime: formatRelativeTime(message.createdAt, FIXED_NOW),
  }));

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

test("read_messages returns messages from the bound room", async () => {
  const port = makePort("room-1", fixedMessages);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
    now: () => FIXED_NOW,
  });
  const result = await upstream.callTool("workspace.read_messages", {}) as { messages: WorkspaceMessage[] };
  expect(result.messages).toEqual(withReadableTime(fixedMessages));
});

test("read_messages annotates messages with friendly and relative time", async () => {
  const port = makePort("room-1", fixedMessages);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
    now: () => FIXED_NOW,
  });
  const result = await upstream.callTool("workspace.read_messages", {}) as {
    messages: (WorkspaceMessage & { time: string; relativeTime: string })[];
  };
  expect(result.messages.map((m) => ({ time: m.time, relativeTime: m.relativeTime }))).toEqual([
    { time: "Jul 26, 2026 at 2:32 PM UTC", relativeTime: "yesterday" },
    { time: "Jul 27, 2026 at 2:27 PM UTC", relativeTime: "5 minutes ago" },
    { time: "Jul 27, 2026 at 2:31 PM UTC", relativeTime: "30 seconds ago" },
  ]);
});

test("read_messages respects limit", async () => {
  const port = makePort("room-1", fixedMessages);
  const upstream = createWorkspaceMcpUpstream({
    port,
    roomId: "room-1",
    agent: { id: "agent-1", name: "TestBot" },
    now: () => FIXED_NOW,
  });
  const result = await upstream.callTool("workspace.read_messages", { limit: 2 }) as { messages: WorkspaceMessage[] };
  expect(result.messages).toEqual(withReadableTime(fixedMessages.slice(-2)));
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
