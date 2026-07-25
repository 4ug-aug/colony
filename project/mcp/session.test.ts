import { expect, test } from "bun:test";
import { createMcpGateway } from "./gateway";
import { createCapabilitySessionFactory } from "./session";

test("a capability session factory creates and revokes a run-scoped session", async () => {
  let revoked = false;
  const gateway = createMcpGateway({
    createToken: () => "run-token",
    upstream: { listTools: async () => [], callTool: async () => "ok" },
  });
  const originalRevoke = gateway.revokeSession;
  gateway.revokeSession = (token) => {
    revoked = originalRevoke(token);
  };
  const factory = createCapabilitySessionFactory({
    gateway,
    url: "http://gateway.test/mcp",
  });
  const session = factory.create({
    tools: ["linear.getIssue"],
    expiresAt: new Date(Date.now() + 60_000),
  });

  expect(session).toMatchObject({
    url: "http://gateway.test/mcp",
    token: "run-token",
    allowedTools: ["linear.getIssue"],
  });
  session.revoke();
  session.revoke();
  expect(revoked).toBe(true);
  await expect(gateway.listTools(session.token)).rejects.toThrow("expired");
});
