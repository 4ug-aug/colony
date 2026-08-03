import type { McpGateway, McpGrant } from "./gateway";
import type { AgentGrantContext } from "../agents/grant-context";
import type { PreparedWorkspace } from "../runs";
import type { Sandbox } from "../sandboxes";

export interface CapabilitySessionBinding {
  url: string;
  token: string;
  expiresAt: Date;
  allowedTools: readonly string[];
  revoke(): void | Promise<void>;
}

export type CapabilitySessionContext = {
  workspace?: PreparedWorkspace;
  sandbox?: Pick<Sandbox, "exec">;
  grantContext?: AgentGrantContext;
};

export interface CapabilitySessionFactory {
  create(
    grant: McpGrant,
    context?: CapabilitySessionContext,
  ): CapabilitySessionBinding | Promise<CapabilitySessionBinding>;
}

export function createCapabilitySessionFactory(options: {
  gateway?: McpGateway;
  createGateway?: (
    context: CapabilitySessionContext & { grant: McpGrant },
  ) => McpGateway;
  url?: string;
  createEndpoint?: (gateway: McpGateway) => { url: string; close(): Promise<void> };
}): CapabilitySessionFactory {
  if (!options.gateway && !options.createGateway) {
    throw new Error("An MCP gateway or gateway factory is required");
  }
  if (!options.url && !options.createEndpoint) {
    throw new Error("An MCP endpoint URL or endpoint factory is required");
  }
  return {
    async create(grant, context = {}) {
      const { workspace, sandbox, grantContext } = context;
      const gateway =
        options.createGateway?.({ grant, workspace, sandbox, grantContext }) ??
        options.gateway!;
      const session = gateway.createSession(grant);
      const endpoint = options.createEndpoint?.(gateway);
      try {
        await gateway.listTools(session.token);
      } catch (error) {
        gateway.revokeSession(session.token);
        await endpoint?.close();
        throw error;
      }
      let revoked = false;
      return {
        url: endpoint?.url ?? options.url!,
        token: session.token,
        expiresAt: session.expiresAt,
        allowedTools: [...grant.tools],
        async revoke() {
          if (!revoked) {
            revoked = true;
            gateway.revokeSession(session.token);
            await endpoint?.close();
          }
        },
      };
    },
  };
}
