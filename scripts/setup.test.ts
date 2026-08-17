import { expect, test } from "bun:test";
import {
  defaultSandboxProvider,
  readEnvValue,
  selectUniversalDmg,
  setEnvValue,
  usesRootlessDocker,
} from "./setup";

test("reads and updates env values without dropping comments or unrelated keys", () => {
  const source =
    "# comment\nBETTER_AUTH_URL=http://localhost:3001\n# LINEAR_MCP_API_KEY=\nOTHER=value\n";
  const updated = setEnvValue(source, "LINEAR_MCP_API_KEY", "key#with spaces");

  expect(readEnvValue(updated, "BETTER_AUTH_URL")).toBe(
    "http://localhost:3001",
  );
  expect(readEnvValue(updated, "LINEAR_MCP_API_KEY")).toBe("key#with spaces");
  expect(updated).toContain("# comment");
  expect(updated).toContain("OTHER=value");
});

test("defaults the sandbox to smolvm", () => {
  expect(defaultSandboxProvider()).toBe("smolvm");
});

test("detects rootless Docker security options", () => {
  expect(usesRootlessDocker('["name=seccomp","name=rootless"]')).toBe(true);
  expect(usesRootlessDocker('["name=seccomp"]')).toBe(false);
});

test("selects the universal DMG from release assets", () => {
  expect(
    selectUniversalDmg([
      { name: "Sweat_aarch64.dmg", browser_download_url: "arm" },
      { name: "Sweat_universal.dmg", browser_download_url: "universal" },
    ]),
  ).toEqual({ name: "Sweat_universal.dmg", browser_download_url: "universal" });
});
