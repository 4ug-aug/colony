import type { McpUpstream } from "./gateway";
import { createRemoteMcpUpstream } from "./remote";

export type GrafanaConfiguration = { url: string; apiKey: string };

/** Remote Grafana MCP over streamable HTTP. Colony does not host the server. */
export function createGrafanaMcpUpstream(
  options: GrafanaConfiguration,
): McpUpstream {
  return createRemoteMcpUpstream({
    name: "grafana",
    url: options.url,
    accessToken: options.apiKey,
  });
}

export function readGrafanaConfiguration(
  environment: Record<string, string | undefined> = process.env,
): GrafanaConfiguration | undefined {
  const url = environment.GRAFANA_MCP_URL || undefined;
  const apiKey = environment.GRAFANA_MCP_API_KEY || undefined;
  if (Boolean(url) !== Boolean(apiKey))
    throw new Error(
      "GRAFANA_MCP_URL and GRAFANA_MCP_API_KEY must be configured together",
    );
  return url && apiKey ? { url, apiKey } : undefined;
}
