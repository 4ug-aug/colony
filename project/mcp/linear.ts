import { MCPServerStreamableHttp } from "@openai/agents";
import { createMcpGateway, type McpGateway } from "./gateway";

export function createLinearMcpGateway(options: {
  accessToken: string;
  url?: string;
  now?: () => Date;
  createToken?: () => string;
}): McpGateway {
  const server = new MCPServerStreamableHttp({
    name: "linear",
    url: options.url ?? "https://mcp.linear.app/mcp",
    requestInit: {
      headers: { Authorization: `Bearer ${options.accessToken}` },
    },
  });
  let connected: Promise<void> | undefined;
  const connect = () => (connected ??= server.connect());

  return createMcpGateway({
    now: options.now,
    createToken: options.createToken,
    upstream: {
      async listTools() {
        await connect();
        return server.listTools();
      },
      async callTool(name, args) {
        await connect();
        return server.callTool(name, args);
      },
    },
  });
}
