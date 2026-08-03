import type { McpUpstream } from "./gateway";
import { createRemoteMcpUpstream } from "./remote";

export function createLinearMcpUpstream(options: {
  accessToken: string;
  url?: string;
}): McpUpstream {
  return createRemoteMcpUpstream({
    name: "linear",
    url: options.url ?? "https://mcp.linear.app/mcp",
    accessToken: options.accessToken,
  });
}
