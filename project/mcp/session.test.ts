import { expect, test } from "bun:test";
import { createMcpGateway } from "./gateway";
import { createCapabilitySessionFactory } from "./session";

test("a capability session factory creates and revokes a run-scoped session", async () => {
  let revoked = false;
  const gateway = createMcpGateway({
    createToken: () => "run-token",
    upstream: { listTools: async () => [{ name: "linear.get_issue" }], callTool: async () => "ok" },
  });
  const originalRevoke = gateway.revokeSession;
  gateway.revokeSession = (token) => {
    revoked = originalRevoke(token);
  };
  const factory = createCapabilitySessionFactory({
    gateway,
    url: "http://gateway.test/mcp",
  });
  const session = await factory.create({
    tools: ["linear.get_issue"],
    expiresAt: new Date(Date.now() + 60_000),
  });

  expect(session).toMatchObject({
    url: "http://gateway.test/mcp",
    token: "run-token",
    allowedTools: ["linear.get_issue"],
  });
  session.revoke();
  session.revoke();
  expect(revoked).toBe(true);
  await expect(gateway.listTools(session.token)).rejects.toThrow("expired");
});
