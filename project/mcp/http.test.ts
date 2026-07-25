import { expect, test } from "bun:test";
import { MCPServerStreamableHttp } from "@openai/agents";
import { createMcpGateway } from "./gateway";
import { createMcpGatewayHttpHandler } from "./http";

test("the MCP HTTP transport exposes only the granted tool and forwards one call", async () => {
  const calls: unknown[] = [];
  const gateway = createMcpGateway({
    createToken: () => "run-token",
    upstream: {
      listTools: async () => [{
        name: "linear.getIssue",
        description: "Read an issue",
        inputSchema: { type: "object", properties: { id: { type: "string" } } },
      }, { name: "linear.updateIssue" }],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { content: [{ type: "text", text: "issue" }] };
      },
    },
  });
  gateway.createSession({
    tools: ["linear.getIssue"],
    expiresAt: new Date(Date.now() + 60_000),
  });
  const handle = createMcpGatewayHttpHandler(gateway);

  const headers = {
      authorization: "Bearer run-token",
      "content-type": "application/json",
    };
    const request = (body: unknown) => handle(new Request("http://gateway.test/mcp", {
      method: "POST", headers, body: JSON.stringify(body),
    }));
    expect(await (await request({ jsonrpc: "2.0", id: 1, method: "initialize" })).json()).toMatchObject({
      result: { capabilities: { tools: {} } },
    });
    const listed = await (await request({ jsonrpc: "2.0", id: 2, method: "tools/list" })).json();
    expect(listed.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "linear.getIssue",
    ]);
    const called = await (await request({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "linear.getIssue", arguments: { id: "ORI-105" } },
    })).json();
    expect(called.result.content).toEqual([{ type: "text", text: "issue" }]);
    const denied = await (await request({
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "linear.updateIssue", arguments: {} },
    })).json();
    expect(denied.error.message).toContain("not granted");
    expect(calls).toEqual([{ name: "linear.getIssue", args: { id: "ORI-105" } }]);
});

test("the transport speaks the client protocol used by the in-container runtime", async () => {
  const gateway = createMcpGateway({
    createToken: () => "client-token",
    upstream: {
      listTools: async () => [{ name: "linear.getIssue" }],
      callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
    },
  });
  gateway.createSession({
    tools: ["linear.getIssue"],
    expiresAt: new Date(Date.now() + 60_000),
  });
  const handle = createMcpGatewayHttpHandler(gateway);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input, init) => handle(new Request(input, init))) as typeof fetch;
  const client = new MCPServerStreamableHttp({
    name: "test",
    url: "http://gateway.test/mcp",
    requestInit: { headers: { Authorization: "Bearer client-token" } },
  });

  try {
    await client.connect();
    expect((await client.listTools()).map((tool) => tool.name)).toEqual(["linear.getIssue"]);
    await expect(client.callTool("linear.getIssue", { id: "ORI-105" })).resolves.toEqual([
      { type: "text", text: "ok" },
    ]);
  } finally {
    await client.close();
    globalThis.fetch = originalFetch;
  }
});
