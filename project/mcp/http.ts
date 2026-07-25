import type { McpGateway, McpTool } from "./gateway";

interface JsonRpcRequest {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
}

function json(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function error(id: unknown, message: string, status = 200): Response {
  return json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code: -32000, message },
  }, { status });
}

function token(request: Request): string | undefined {
  const value = request.headers.get("authorization");
  return value?.startsWith("Bearer ") ? value.slice("Bearer ".length) : undefined;
}

function toolSchema(tool: McpTool): Record<string, unknown> {
  return tool.inputSchema ?? {
    type: "object",
    properties: {},
    additionalProperties: true,
  };
}

function callResult(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value) && "content" in value) {
    return value as Record<string, unknown>;
  }
  if (Array.isArray(value)) return { content: value };
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  };
}

export function createMcpGatewayHttpHandler(
  gateway: McpGateway,
): (request: Request) => Promise<Response> {
  return async (request) => {
    if (new URL(request.url).pathname !== "/mcp") return new Response("Not found", { status: 404 });
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
    const sessionToken = token(request);
    if (!sessionToken) return new Response("Unauthorized", { status: 401 });

    let message: JsonRpcRequest;
    try {
      message = await request.json() as JsonRpcRequest;
    } catch {
      return error(null, "Invalid JSON", 400);
    }
    if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
      return error(message.id, "Invalid JSON-RPC request", 400);
    }
    if (message.id === undefined && message.method === "notifications/initialized") {
      return new Response(null, { status: 202 });
    }
    if (message.method === "initialize") {
      return json({
        jsonrpc: "2.0",
        id: message.id ?? null,
        result: {
          protocolVersion: "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: "sweat-capabilities", version: "0.1.0" },
        },
      });
    }

    try {
      if (message.method === "tools/list") {
        const tools = await gateway.listTools(sessionToken);
        return json({
          jsonrpc: "2.0",
          id: message.id ?? null,
          result: { tools: tools.map((tool) => ({
            name: tool.name,
            ...(tool.description ? { description: tool.description } : {}),
            inputSchema: toolSchema(tool),
          })) },
        });
      }
      if (message.method === "tools/call") {
        const params = message.params;
        if (!params || typeof params !== "object" || Array.isArray(params)) {
          return error(message.id, "Tool call parameters are required");
        }
        const name = (params as { name?: unknown }).name;
        const args = (params as { arguments?: unknown }).arguments;
        if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) {
          return error(message.id, "Tool name and object arguments are required");
        }
        const result = await gateway.callTool(sessionToken, name, args as Record<string, unknown>);
        return json({ jsonrpc: "2.0", id: message.id ?? null, result: callResult(result) });
      }
      return error(message.id, `Unsupported MCP method: ${message.method}`);
    } catch (cause) {
      return error(message.id, cause instanceof Error ? cause.message : String(cause));
    }
  };
}

export function createMcpGatewayHttpServer(options: {
  gateway: McpGateway;
  hostname?: string;
  port?: number;
  publicUrl?: string;
}): { url: string; close(): Promise<void> } {
  const server = Bun.serve({
    hostname: options.hostname ?? "127.0.0.1",
    port: options.port ?? 0,
    fetch: createMcpGatewayHttpHandler(options.gateway),
  });
  const url = options.publicUrl ?? `http://${server.hostname}:${server.port}`;
  return {
    url: `${url.replace(/\/$/, "")}/mcp`,
    close: async () => { await server.stop(); },
  };
}
