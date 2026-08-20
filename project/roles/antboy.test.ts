import { expect, test } from "bun:test";
import { antboyRole } from "./antboy";

test("antboy searches Outline with list_documents and reads with fetch", () => {
  expect(antboyRole.instructions).toContain("outline.list_documents");
  expect(antboyRole.instructions).toContain("outline.fetch");
  expect(antboyRole.instructions).toContain('resource "document"');
  expect(antboyRole.requestedCapabilities).toContainEqual({
    id: "outlook.mail",
    tools: [
      "outlook.search_messages",
      "outlook.get_message",
      "outlook.create_draft",
      "outlook.create_reply_draft",
    ],
  });
  expect(antboyRole.instructions).toContain("never send email");
  expect(antboyRole.instructions).not.toContain("workspace.get_doc");
  expect(antboyRole.instructions).not.toContain("Colony Doc");
});
