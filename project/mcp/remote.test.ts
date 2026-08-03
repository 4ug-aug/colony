import { expect, test } from "bun:test";
import { namespaceMcpUpstream, type RemoteMcpServer } from "./remote";

const inputSchema = {
  type: "object" as const,
  properties: {},
  required: [],
  additionalProperties: false,
};

function stubServer() {
  const calls: { tool: string; args: Record<string, unknown> | null }[] = [];
  let connects = 0;
  const server: RemoteMcpServer = {
    async connect() {
      connects += 1;
    },
    async listTools() {
      return [
        { name: "list_documents", inputSchema },
        { name: "fetch", description: "Fetch", inputSchema },
      ];
    },
    async callTool(tool, args) {
      calls.push({ tool, args });
      return [];
    },
  };
  return { server, calls, connects: () => connects };
}

test("a namespaced upstream prefixes tool names and strips the prefix when calling", async () => {
  const { server, calls, connects } = stubServer();
  const upstream = namespaceMcpUpstream("outline", server);

  const tools = await upstream.listTools();
  expect(tools.map((tool) => tool.name)).toEqual([
    "outline.list_documents",
    "outline.fetch",
  ]);
  expect(tools[1]?.description).toBe("Fetch");

  await upstream.callTool("outline.fetch", { id: "doc-1" });
  expect(calls).toEqual([{ tool: "fetch", args: { id: "doc-1" } }]);
  // One connection for the life of the upstream, not one per call.
  expect(connects()).toBe(1);
});

test("a namespaced upstream rejects tools outside its namespace", async () => {
  const { server, calls } = stubServer();
  const upstream = namespaceMcpUpstream("outline", server);

  await expect(upstream.callTool("linear.get_issue", {})).rejects.toThrow(
    "Unknown outline tool: linear.get_issue",
  );
  expect(calls).toEqual([]);
});
