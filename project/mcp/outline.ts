import type { McpUpstream } from "./gateway";
import { createRemoteMcpUpstream } from "./remote";

export type OutlineConfiguration = { url: string; apiKey: string };

/** Accept instance root or a pasted `…/mcp` endpoint; always talk to `<instance>/mcp`. */
export function outlineMcpUrl(instanceOrMcpUrl: string): string {
  const base = instanceOrMcpUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/mcp$/i, "");
  return `${base}/mcp`;
}

/** Outline serves MCP at `<instance>/mcp`; cloud instances are https://<subdomain>.getoutline.com. */
export function createOutlineMcpUpstream(
  options: OutlineConfiguration,
): McpUpstream {
  return createRemoteMcpUpstream({
    name: "outline",
    url: outlineMcpUrl(options.url),
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
