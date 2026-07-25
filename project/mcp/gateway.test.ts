import { expect, test } from "bun:test";
import { createMcpGateway } from "./gateway";

test("a session exposes and invokes only its granted MCP tools", async () => {
  const calls: unknown[] = [];
  const gateway = createMcpGateway({
    now: () => new Date("2026-07-24T12:00:00Z"),
    createToken: () => "run-token",
    upstream: {
      listTools: async () => [{ name: "get_issue" }, { name: "update_issue" }],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return "ok";
      },
    },
  });
  const session = gateway.createSession({
    tools: ["get_issue"],
    expiresAt: new Date("2026-07-24T12:05:00Z"),
  });

  await expect(gateway.listTools(session.token)).resolves.toEqual([
    { name: "get_issue" },
  ]);
  await expect(gateway.callTool(session.token, "get_issue", { id: "ENG-123" })).resolves.toBe("ok");
  await expect(gateway.callTool(session.token, "update_issue", {})).rejects.toThrow(
    "MCP tool is not granted",
  );
  expect(calls).toEqual([{ name: "get_issue", args: { id: "ENG-123" } }]);
});

test("a session fails when an upstream tool named in its grant is unavailable", async () => {
  const gateway = createMcpGateway({
    upstream: {
      listTools: async () => [{ name: "get_issue" }],
      callTool: async () => "ok",
    },
  });
  const session = gateway.createSession({
    tools: ["linear.getIssue"],
    expiresAt: new Date(Date.now() + 60_000),
  });

  await expect(gateway.listTools(session.token)).rejects.toThrow(
    "Granted MCP tools are unavailable: linear.getIssue",
  );
});
