import { MCPServerStreamableHttp } from "@openai/agents";
import { createMcpGateway, type McpGateway, type McpUpstream } from "./gateway";

export function createLinearMcpUpstream(options: {
  accessToken: string;
  url?: string;
  now?: () => Date;
  createToken?: () => string;
}): McpUpstream {
  const server = new MCPServerStreamableHttp({
    name: "linear",
    url: options.url ?? "https://mcp.linear.app/mcp",
    requestInit: {
      headers: { Authorization: `Bearer ${options.accessToken}` },
    },
  });
  let connected: Promise<void> | undefined;
  const connect = () => (connected ??= server.connect());

  return {
    async listTools() {
      await connect();
      return (await server.listTools()).map((tool) => ({ ...tool, name: `linear.${tool.name}` }));
    },
    async callTool(name, args) {
      if (!name.startsWith("linear.")) throw new Error(`Unknown Linear tool: ${name}`);
      await connect();
      return server.callTool(name.slice("linear.".length), args);
    },
  };
}

export function createLinearMcpGateway(options: {
  accessToken: string;
  url?: string;
  now?: () => Date;
  createToken?: () => string;
}): McpGateway {
  return createMcpGateway({
    now: options.now,
    createToken: options.createToken,
    upstream: createLinearMcpUpstream(options),
  });
}
