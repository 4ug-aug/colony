import { expect, test } from "bun:test";
import { outlineMcpUrl, readOutlineConfiguration } from "./outline";

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
