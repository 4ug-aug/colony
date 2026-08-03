import type { McpUpstream } from "./gateway";
import { createRemoteMcpUpstream } from "./remote";

export type OutlineConfiguration = { url: string; apiKey: string };

/** Outline serves MCP at `<instance>/mcp`; cloud instances are https://<subdomain>.getoutline.com. */
export function createOutlineMcpUpstream(
  options: OutlineConfiguration,
): McpUpstream {
  return createRemoteMcpUpstream({
    name: "outline",
    url: `${options.url.replace(/\/$/, "")}/mcp`,
    accessToken: options.apiKey,
  });
}

export function readOutlineConfiguration(
  environment: Record<string, string | undefined> = process.env,
): OutlineConfiguration | undefined {
  const url = environment.OUTLINE_URL || undefined;
  const apiKey = environment.OUTLINE_API_KEY || undefined;
  if (Boolean(url) !== Boolean(apiKey))
    throw new Error(
      "OUTLINE_URL and OUTLINE_API_KEY must be configured together",
    );
  return url && apiKey ? { url, apiKey } : undefined;
}
