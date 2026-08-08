import { expect, test } from "bun:test";
import { createWorkspaceGrillAdapter } from "./software-engineer-adapters";

test("workspace.grill applies only when grantContext.grillId is set", () => {
  const adapter = createWorkspaceGrillAdapter({
    port: {
      setFrontier: () => undefined,
      setIssueProposal: () => undefined,
    },
  });
  expect(adapter.capability?.applies?.({})).toBe(false);
  expect(adapter.capability?.applies?.({ grantContext: {} })).toBe(false);
  expect(
    adapter.capability?.applies?.({ grantContext: { grillId: "grill-1" } }),
  ).toBe(true);
});
