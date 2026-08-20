import { expect, test } from "bun:test";
import {
  clarifyOutlineUpstream,
  outlineMcpUrl,
  readOutlineConfiguration,
} from "./outline";

const url = "https://acme.getoutline.com";
const apiKey = "ol_api_test";

test("Outline configuration must be complete", () => {
  expect(readOutlineConfiguration({})).toBeUndefined();
  expect(readOutlineConfiguration({ OUTLINE_URL: url, OUTLINE_API_KEY: apiKey })).toEqual({
    url,
    apiKey,
  });
  expect(() => readOutlineConfiguration({ OUTLINE_URL: url })).toThrow(
    "configured together",
  );
  expect(() => readOutlineConfiguration({ OUTLINE_API_KEY: apiKey })).toThrow(
    "configured together",
  );
});

test("Outline MCP URL accepts instance root or a pasted /mcp endpoint", () => {
  expect(outlineMcpUrl("https://docs.securedevice.local")).toBe(
    "https://docs.securedevice.local/mcp",
  );
  expect(outlineMcpUrl("https://docs.securedevice.local/")).toBe(
    "https://docs.securedevice.local/mcp",
  );
  expect(outlineMcpUrl("https://docs.securedevice.local/mcp")).toBe(
    "https://docs.securedevice.local/mcp",
  );
  expect(outlineMcpUrl("https://docs.securedevice.local/mcp ")).toBe(
    "https://docs.securedevice.local/mcp",
  );
});

test("Outline list/fetch descriptions tell the agent how to search then read a wiki page", async () => {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  const upstream = clarifyOutlineUpstream({
    listTools: async () => [
      { name: "outline.list_documents", description: "Search documents" },
      { name: "outline.fetch", description: "Fetch" },
      { name: "outline.list_collections", description: "List collections" },
    ],
    callTool: async (tool, args) => {
      calls.push({ tool, args });
      return {};
    },
  });

  const tools = await upstream.listTools();
  expect(tools.find((tool) => tool.name === "outline.list_documents")?.description).toContain(
    "query",
  );
  expect(tools.find((tool) => tool.name === "outline.fetch")?.description).toContain(
    'resource "document"',
  );
  expect(tools.find((tool) => tool.name === "outline.list_collections")?.description).toBe(
    "List collections",
  );

  await upstream.callTool("outline.fetch", { resource: "document", id: "doc-1" });
  expect(calls).toEqual([
    { tool: "outline.fetch", args: { resource: "document", id: "doc-1" } },
  ]);
});
