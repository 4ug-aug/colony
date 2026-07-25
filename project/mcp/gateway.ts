export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpUpstream {
  listTools(): Promise<readonly McpTool[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

export interface McpGrant {
  tools: readonly string[];
  expiresAt: Date;
}

export interface McpGateway {
  createSession(grant: McpGrant): { token: string; expiresAt: Date };
  listTools(token: string): Promise<readonly McpTool[]>;
  callTool(
    token: string,
    name: string,
    args: Record<string, unknown>,
  ): Promise<unknown>;
  revokeSession(token: string): void;
}

export function createMcpGateway(options: {
  upstream: McpUpstream;
  now?: () => Date;
  createToken?: () => string;
}): McpGateway {
  const now = options.now ?? (() => new Date());
  const createToken = options.createToken ?? (() => crypto.randomUUID());
  const sessions = new Map<string, McpGrant>();

  const grantFor = (token: string): McpGrant => {
    const grant = sessions.get(token);
    if (!grant || grant.expiresAt <= now()) throw new Error("MCP session expired");
    return grant;
  };

  return {
    createSession(grant) {
      if (grant.expiresAt <= now()) throw new Error("MCP session already expired");
      const token = createToken();
      sessions.set(token, grant);
      return { token, expiresAt: grant.expiresAt };
    },

    async listTools(token) {
      const granted = grantFor(token).tools;
      const allowed = new Set(granted);
      const tools = (await options.upstream.listTools()).filter((tool) => allowed.has(tool.name));
      const available = new Set(tools.map((tool) => tool.name));
      const missing = granted.filter((name) => !available.has(name));
      if (missing.length) throw new Error(`Granted MCP tools are unavailable: ${missing.join(", ")}`);
      return tools;
    },

    async callTool(token, name, args) {
      if (!grantFor(token).tools.includes(name)) {
        throw new Error(`MCP tool is not granted: ${name}`);
      }
      return options.upstream.callTool(name, args);
    },

    revokeSession: (token) => sessions.delete(token),
  };
}
