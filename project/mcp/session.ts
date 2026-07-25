import type { McpGateway, McpGrant } from "./gateway";

export interface CapabilitySessionBinding {
  url: string;
  token: string;
  expiresAt: Date;
  allowedTools: readonly string[];
  revoke(): void;
}

export interface CapabilitySessionFactory {
  create(grant: McpGrant): CapabilitySessionBinding;
}

export function createCapabilitySessionFactory(options: {
  gateway: McpGateway;
  url: string;
}): CapabilitySessionFactory {
  return {
    create(grant) {
      const session = options.gateway.createSession(grant);
      let revoked = false;
      return {
        url: options.url,
        token: session.token,
        expiresAt: session.expiresAt,
        allowedTools: [...grant.tools],
        revoke() {
          if (!revoked) {
            revoked = true;
            options.gateway.revokeSession(session.token);
          }
        },
      };
    },
  };
}
