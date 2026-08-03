import { expect, test } from "bun:test";
import { readOutlineConfiguration } from "./outline";

const url = "https://acme.getoutline.com";
const apiKey = "ol_api_test";

test("Outline configuration must be complete", () => {
  expect(readOutlineConfiguration({})).toBeUndefined();
  expect(readOutlineConfiguration({ OUTLINE_URL: url, OUTLINE_API_KEY: apiKey })).toEqual({
    url,
    apiKey,
  });
  expect(() => readOutlineConfiguration({ OUTLINE_URL: url })).toThrow(
    "configured together",
  );
  expect(() => readOutlineConfiguration({ OUTLINE_API_KEY: apiKey })).toThrow(
    "configured together",
  );
});
