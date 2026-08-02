import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";

export type SandboxProvider = "apple-container" | "docker";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type CommandOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
};

const root = join(import.meta.dir, "..");
const defaultEnvPath = join(root, ".env.local");
const releaseApi =
  "https://api.github.com/repos/4ug-aug/sweat-v2/releases/latest";

function envPattern(key: string, commented = false): RegExp {
  const prefix = commented ? "(?:#\\s*)?" : "";
  return new RegExp(
    `^${prefix}${key.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}=`,
  );
}

function decodeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'"))
    return trimmed.slice(1, -1);
  return trimmed;
}

export function readEnvValue(
  document: string,
  key: string,
): string | undefined {
  const line = document
    .split(/\r?\n/)
    .find((candidate) => envPattern(key).test(candidate));
  if (!line) return undefined;
  return decodeEnvValue(line.slice(key.length + 1)) || undefined;
}

function encodeEnvValue(value: string): string {
  return /^[A-Za-z0-9_./:@+,-]+$/.test(value) ? value : JSON.stringify(value);
}

export function setEnvValue(
  document: string,
  key: string,
  value: string,
): string {
  const lines = document.split(/\r?\n/);
  const index = lines.findIndex((line) => envPattern(key, true).test(line));
  const replacement = `${key}=${encodeEnvValue(value)}`;
  if (index >= 0) lines[index] = replacement;
  else {
    if (lines.at(-1) === "") lines.pop();
    lines.push(replacement);
  }
  return `${lines.join("\n")}\n`;
}

export function defaultSandboxProvider(
  platform: NodeJS.Platform = process.platform,
): SandboxProvider {
  return platform === "darwin" ? "apple-container" : "docker";
}

export function selectUniversalDmg(
  assets: readonly ReleaseAsset[],
): ReleaseAsset | undefined {
  return assets.find(
    (asset) =>
      asset.name.toLowerCase().endsWith(".dmg") &&
      asset.name.toLowerCase().includes("universal"),
  );
}

async function input(label: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = prompt(`${label}${suffix} `);
  if (answer === null) throw new Error("Setup cancelled");
  return answer.trim() || defaultValue || "";
}

async function choose(
  label: string,
  options: readonly string[],
  defaultIndex = 0,
): Promise<number> {
  console.log(`\n${label}`);
  options.forEach((option, index) => console.log(`  ${index + 1}) ${option}`));
  while (true) {
    const value = await input(`Choose`, String(defaultIndex + 1));
    const index = Number(value) - 1;
    if (Number.isInteger(index) && index >= 0 && index < options.length)
      return index;
    console.log(`Choose a number from 1 to ${options.length}.`);
  }
}

async function secret(label: string, current?: string): Promise<string> {
  if (current !== undefined) {
    const value = await input(`${label} (leave blank to keep current)`);
    return value || current;
  }
  if (!process.stdin.isTTY) return input(label);

  process.stdout.write(`${label}: `);
  const child = Bun.spawn(
    [
      "sh",
      "-c",
      'stty -echo; trap \'stty echo\' EXIT HUP INT TERM; IFS= read -r value; printf "%s" "$value"',
    ],
    { stdin: "inherit", stdout: "pipe", stderr: "inherit" },
  );
  const [exitCode, value] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  process.stdout.write("\n");
  if (exitCode !== 0) throw new Error(`Could not read ${label.toLowerCase()}`);
  return value.trim();
}

async function run(
  command: string,
  args: readonly string[],
  options: CommandOptions = {},
): Promise<void> {
  const child = Bun.spawn([command, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const exitCode = await child.exited;
  if (exitCode !== 0)
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
}

async function available(command: string): Promise<boolean> {
  const child = Bun.spawn(
    ["sh", "-c", 'command -v "$1" >/dev/null 2>&1', "setup", command],
    { stdout: "ignore", stderr: "ignore" },
  );
  return (await child.exited) === 0;
}

async function requireRuntime(provider: SandboxProvider): Promise<void> {
  if (!(await available(provider === "docker" ? "docker" : "container"))) {
    throw new Error(
      provider === "docker"
        ? "Docker is required. Install Docker Desktop, start it, and rerun make setup."
        : "Apple Container is required. Install it from https://github.com/apple/container and rerun make setup.",
    );
  }
  if (provider === "docker") await run("docker", ["info"]);
  else await run("container", ["system", "start"]);
}

async function requireGitHubCli(): Promise<void> {
  if (!(await available("gh")))
    throw new Error(
      "GitHub CLI is required. Install it from https://cli.github.com/ and rerun make setup.",
    );
  try {
    await run("gh", ["auth", "status"]);
  } catch {
    throw new Error(
      "Authenticate GitHub CLI with `gh auth login`, then rerun make setup.",
    );
  }
}

async function readOptional(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function envPath(): string {
  const configured = process.env.ENV_FILE;
  if (!configured) return defaultEnvPath;
  return isAbsolute(configured) ? configured : join(root, configured);
}

async function saveEnv(
  path: string,
  current: string | undefined,
  document: string,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  if (current !== undefined) {
    const backup = `${path}.bak.${new Date().toISOString().replace(/[:.]/g, "-")}`;
    await writeFile(backup, current);
    console.log(`Backed up existing environment to ${backup}`);
  }
  await writeFile(path, document);
  console.log(`Wrote ${path}`);
}

async function configureServer(path: string): Promise<void> {
  const current = await readOptional(path);
  let document =
    current ?? (await readFile(join(root, ".env.example"), "utf8"));
  const existing = (key: string) => readEnvValue(current ?? "", key);

  const secretValue =
    existing("BETTER_AUTH_SECRET") ?? randomBytes(32).toString("base64");
  const authUrl = await input(
    "Server URL",
    existing("BETTER_AUTH_URL") ?? "http://localhost:3001",
  );
  const guiOrigin = await input(
    "Browser GUI origin",
    existing("SWEAT_GUI_ORIGIN") ?? "http://localhost:3000",
  );
  const providerOptions: readonly SandboxProvider[] = [
    "apple-container",
    "docker",
  ];
  const existingProvider = existing("SWEAT_SANDBOX_PROVIDER");
  const provider =
    providerOptions[
      await choose(
        "Agent sandbox",
        providerOptions,
        Math.max(
          0,
          providerOptions.indexOf(existingProvider as SandboxProvider) >= 0
            ? providerOptions.indexOf(existingProvider as SandboxProvider)
            : providerOptions.indexOf(defaultSandboxProvider()),
        ),
      )
    ]!;

  document = setEnvValue(document, "BETTER_AUTH_SECRET", secretValue);
  document = setEnvValue(document, "BETTER_AUTH_URL", authUrl);
  document = setEnvValue(document, "SWEAT_GUI_ORIGIN", guiOrigin);
  document = setEnvValue(document, "SWEAT_SANDBOX_PROVIDER", provider);

  const githubConfigured = Boolean(existing("SWEAT_GITHUB_REPOSITORY"));
  const linearConfigured = Boolean(existing("LINEAR_MCP_API_KEY"));
  const integrations = await choose(
    "Optional integrations",
    ["None", "GitHub", "Linear", "GitHub + Linear"],
    githubConfigured && linearConfigured
      ? 3
      : githubConfigured
        ? 1
        : linearConfigured
          ? 2
          : 0,
  );
  const useGitHub = integrations === 1 || integrations === 3;
  const useLinear = integrations === 2 || integrations === 3;

  if (useGitHub) {
    await requireGitHubCli();
    document = setEnvValue(
      document,
      "SWEAT_GITHUB_REPOSITORY",
      await input(
        "GitHub repository (owner/name)",
        existing("SWEAT_GITHUB_REPOSITORY"),
      ),
    );
    document = setEnvValue(
      document,
      "SWEAT_GITHUB_BASE",
      await input(
        "GitHub base branch",
        existing("SWEAT_GITHUB_BASE") ?? "main",
      ),
    );
    const verify = await input(
      "Verification command (optional)",
      existing("SWEAT_VERIFY_COMMAND"),
    );
    if (verify)
      document = setEnvValue(document, "SWEAT_VERIFY_COMMAND", verify);
  }
  if (useLinear) {
    const token = await secret(
      "Linear API key",
      existing("LINEAR_MCP_API_KEY"),
    );
    if (!token)
      throw new Error("A Linear API key is required when Linear is selected.");
    document = setEnvValue(document, "LINEAR_MCP_API_KEY", token);
  }

  await saveEnv(path, current, document);
  await requireRuntime(provider);
  await run("bun", ["install", "--cwd", "project", "--frozen-lockfile"]);
  await run("bun", ["install", "--cwd", "project/gui", "--frozen-lockfile"]);
  const commandEnv = { ...process.env, ENV_FILE: path };
  await run("make", ["agent"], { env: commandEnv });
  await run("make", ["migrate"], { env: commandEnv });
  console.log(
    "\nServer setup complete. Start it with `make server` or `make dev`.",
  );
}

async function installMacApplication(): Promise<void> {
  if (process.platform !== "darwin")
    throw new Error("The macOS application can only be installed on macOS.");
  const response = await fetch(releaseApi, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "sweat-setup",
    },
  });
  if (!response.ok)
    throw new Error(
      `Could not read the latest GitHub release (${response.status}).`,
    );
  const release = (await response.json()) as { assets?: ReleaseAsset[] };
  const asset = selectUniversalDmg(release.assets ?? []);
  if (!asset)
    throw new Error(
      "The latest GitHub release does not contain a universal macOS DMG.",
    );
  const download = await fetch(asset.browser_download_url);
  if (!download.ok)
    throw new Error(`Could not download ${asset.name} (${download.status}).`);
  const path = join(tmpdir(), asset.name);
  await Bun.write(path, await download.arrayBuffer());
  await run("open", [path]);
  console.log(
    `Opened ${path}. Drag Sweat to Applications to finish installation.`,
  );
}

export async function runSetup(): Promise<void> {
  const choice = await choose("What do you want to set up?", [
    "Server setup",
    "Install mac application",
    "Exit",
  ]);
  if (choice === 0) await configureServer(envPath());
  else if (choice === 1) await installMacApplication();
}

if (import.meta.main) {
  runSetup().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
