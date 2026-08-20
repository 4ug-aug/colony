import { expect, test } from "bun:test";
import { antboyRole } from "./antboy";

test("antboy searches Outline with list_documents and reads with fetch", () => {
  expect(antboyRole.instructions).toContain("outline.list_documents");
  expect(antboyRole.instructions).toContain("outline.fetch");
  expect(antboyRole.instructions).toContain('resource "document"');
  expect(antboyRole.instructions).not.toContain("workspace.get_doc");
  expect(antboyRole.instructions).not.toContain("Colony Doc");
});

test("antboy invokes another Room agent with an @mention, not Issue assignment", () => {
  expect(antboyRole.instructions).toContain("@software-engineer");
  expect(antboyRole.instructions).toContain("@antboy");
  expect(antboyRole.instructions).toContain("not by assigning an Issue");
  expect(antboyRole.instructions).toContain(
    "do not assign an Issue as a substitute spawn",
  );
  expect(antboyRole.instructions).toContain("plus a task");
});
