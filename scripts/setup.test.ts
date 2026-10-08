import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  defaultSandboxProvider,
  installAgentSetupExample,
  readEnvValue,
  requireGuestReachableMcpHost,
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

test("rejects a rootless-Docker MCP host on a microVM install", () => {
  expect(() => requireGuestReachableMcpHost("http://10.0.2.2")).toThrow(
    /unreachable from a microVM/,
  );
  expect(() => requireGuestReachableMcpHost("http://192.168.1.47")).not.toThrow();
  expect(() => requireGuestReachableMcpHost(undefined)).not.toThrow();
});

test("selects the universal DMG from release assets", () => {
  expect(
    selectUniversalDmg([
      { name: "Sweat_aarch64.dmg", browser_download_url: "arm" },
      { name: "Sweat_universal.dmg", browser_download_url: "universal" },
    ]),
  ).toEqual({ name: "Sweat_universal.dmg", browser_download_url: "universal" });
});

test("copies the agent setup example once and never overwrites setup.sh", async () => {
  const dir = await mkdtemp(join(tmpdir(), "agent-setup-"));
  await writeFile(join(dir, "setup.sh.example"), "example");
  expect(await installAgentSetupExample(dir)).toBe(true);
  expect(await readFile(join(dir, "setup.sh"), "utf8")).toBe("example");
  await writeFile(join(dir, "setup.sh"), "mine");
  expect(await installAgentSetupExample(dir)).toBe(false);
  expect(await readFile(join(dir, "setup.sh"), "utf8")).toBe("mine");
});
