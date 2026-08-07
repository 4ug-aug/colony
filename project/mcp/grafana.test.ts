import { expect, test } from "bun:test";
import { readGrafanaConfiguration } from "./grafana";

const url = "https://mcp.example.com/mcp";
const apiKey = "grafana_mcp_test";

test("Grafana MCP configuration must be complete", () => {
  expect(readGrafanaConfiguration({})).toBeUndefined();
  expect(
    readGrafanaConfiguration({
      GRAFANA_MCP_URL: url,
      GRAFANA_MCP_API_KEY: apiKey,
    }),
  ).toEqual({ url, apiKey });
  expect(() => readGrafanaConfiguration({ GRAFANA_MCP_URL: url })).toThrow(
    "configured together",
  );
  expect(() =>
    readGrafanaConfiguration({ GRAFANA_MCP_API_KEY: apiKey }),
  ).toThrow("configured together");
});
