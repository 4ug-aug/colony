import { expect, test } from "bun:test";
import {
  candidateListing,
  expandGrantedNames,
  intersectGrantedTools,
  selectGrantedTools,
} from "./grant-tools";

const eligible = [
  "workspace.list_issues",
  "workspace.get_issue",
  "github.compare",
  "github.get_file",
];
const bundles = {
  issues: ["workspace.list_issues", "workspace.get_issue"],
  github: ["github.compare", "github.get_file"],
};

test("all mode returns every eligible tool", async () => {
  expect(
    await selectGrantedTools({ mode: "all" }, { task: "anything", eligibleTools: eligible }),
  ).toEqual(eligible);
});

test("allowlist intersects with eligible and fails safe to eligible", async () => {
  expect(
    await selectGrantedTools(
      { mode: "allowlist", tools: ["workspace.get_issue", "missing.tool"] },
      { task: "read SWE-1", eligibleTools: eligible },
    ),
  ).toEqual(["workspace.get_issue"]);
  expect(
    await selectGrantedTools(
      { mode: "allowlist", tools: ["missing.tool"] },
      { task: "read SWE-1", eligibleTools: eligible },
    ),
  ).toEqual(eligible);
});

test("bundles expand default bundle ids", async () => {
  expect(
    await selectGrantedTools(
      { mode: "bundles", bundles, defaultBundles: ["issues"] },
      { task: "list issues", eligibleTools: eligible, bundles },
    ),
  ).toEqual(["workspace.list_issues", "workspace.get_issue"]);
});

test("model picker yields tools and ignores unknown names", async () => {
  const selected = await selectGrantedTools(
    { mode: "model" },
    { task: "diff main and this branch", eligibleTools: eligible, bundles },
    {
      pick: async () => ["github", "bogus.tool"],
    },
  );
  expect(selected).toEqual(["github.compare", "github.get_file"]);
});

test("model picker failure falls back to allowlist then eligible", async () => {
  expect(
    await selectGrantedTools(
      { mode: "model", tools: ["workspace.get_issue"] },
      { task: "go", eligibleTools: eligible },
      { pick: async () => { throw new Error("provider down"); } },
    ),
  ).toEqual(["workspace.get_issue"]);
  expect(
    await selectGrantedTools(
      { mode: "model" },
      { task: "go", eligibleTools: eligible },
      { pick: async () => { throw new Error("provider down"); } },
    ),
  ).toEqual(eligible);
});

test("expand and intersect keep grant names unique and eligible", () => {
  expect(expandGrantedNames(["issues", "github.compare"], bundles)).toEqual([
    "workspace.list_issues",
    "workspace.get_issue",
    "github.compare",
  ]);
  expect(intersectGrantedTools(["github.compare", "nope"], eligible)).toEqual([
    "github.compare",
  ]);
});

test("candidate listing includes bundle ids and tool descriptions", () => {
  const { names, listing } = candidateListing({
    task: "x",
    eligibleTools: ["workspace.get_issue"],
    bundles: { issues: ["workspace.get_issue"] },
    descriptions: { "workspace.get_issue": "Issues: Get issues" },
  });
  expect(names).toEqual(["issues", "workspace.get_issue"]);
  expect(listing).toContain("issues (bundle)");
  expect(listing).toContain("Issues: Get issues");
});
