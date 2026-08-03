import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import {
  cancel,
  intro,
  isCancel,
  log,
  multiselect,
  outro,
  password,
  select,
  spinner,
  text,
} from "@clack/prompts";

export type SandboxProvider = "apple-container" | "docker";

type Integration = "github" | "linear" | "asana" | "outline";

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type CommandOptions = {
  cwd?: string;
  env?: Record<string, string | undefined>;
};

const root = join(import.meta.dirname, "..");
const defaultEnvPath = join(root, ".env.local");
const defaultAgentImage = "ghcr.io/4ug-aug/sweat-v2-agent:latest";
// Docker 26+; add version gating only if older rootless engines need support.
const rootlessDockerMcpHost = "http://10.0.2.2";
const rootlessDockerOverride = `[Service]
Environment=DOCKERD_ROOTLESS_ROOTLESSKIT_DISABLE_HOST_LOOPBACK=false
`;
const releaseApi =
  "https://api.github.com/repos/4ug-aug/sweat-v2/releases/latest";

function assertNotCancelled<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel("Setup cancelled");
    process.exit(0);
  }
  return value;
}

async function askText(
  message: string,
  initialValue?: string,
  validate?: (value: string) => string | Error | undefined,
): Promise<string> {
  return assertNotCancelled(
    await text({
      message,
      initialValue,
      placeholder: initialValue,
      validate,
    }),
  );
}

async function askSecret(message: string, current?: string): Promise<string> {
  const value = assertNotCancelled(
    await password({
      message: current ? `${message} (leave blank to keep current)` : message,
    }),
  );
  return value.trim() || current || "";
}

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

async function output(
  command: string,
  args: readonly string[],
): Promise<string> {
  const child = Bun.spawn([command, ...args], {
    stdin: "ignore",
    stdout: "pipe",
    stderr: "inherit",
  });
  const [exitCode, stdout] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
  ]);
  if (exitCode !== 0)
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
  return stdout.trim();
}

async function available(command: string): Promise<boolean> {
  const child = Bun.spawn(
    ["sh", "-c", 'command -v "$1" >/dev/null 2>&1', "setup", command],
    { stdout: "ignore", stderr: "ignore" },
  );
  return (await child.exited) === 0;
}

export function usesRootlessDocker(securityOptions: string): boolean {
  return securityOptions.includes("name=rootless");
}

async function requireRuntime(provider: SandboxProvider): Promise<boolean> {
  if (!(await available(provider === "docker" ? "docker" : "container"))) {
    throw new Error(
      provider === "docker"
        ? "Docker is required. Install Docker Desktop, start it, and rerun make setup."
        : "Apple Container is required. Install it from https://github.com/apple/container and rerun make setup.",
    );
  }
  if (provider === "docker") {
    return usesRootlessDocker(
      await output("docker", ["info", "--format", "{{json .SecurityOptions}}"]),
    );
  }
  await run("container", ["system", "start"]);
  return false;
}

async function configureRootlessDocker(): Promise<void> {
  if (!(await available("systemctl"))) {
    throw new Error(
      "Rootless Docker requires systemd user services for automatic setup.",
    );
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
  const path = join(
    configHome,
    "systemd/user/docker.service.d/sweat-host-loopback.conf",
  );
  if ((await readOptional(path)) === rootlessDockerOverride) return;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, rootlessDockerOverride);
  console.log("Enabled host access for rootless Docker agent containers.");
  await run("systemctl", ["--user", "daemon-reload"]);
  await run("systemctl", ["--user", "restart", "docker"]);
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

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 ** 2).toFixed(1)} MiB`;
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
  const authUrl = await askText(
    "Server URL",
    existing("BETTER_AUTH_URL") ?? "http://localhost:3001",
    (value) => (value.trim() ? undefined : "Server URL is required"),
  );
  const guiOrigin = await askText(
    "GUI origin",
    existing("SWEAT_GUI_ORIGIN") ?? "tauri://localhost",
    (value) => (value.trim() ? undefined : "GUI origin is required"),
  );
  const existingProvider = existing("SWEAT_SANDBOX_PROVIDER");
  const defaultProvider =
    existingProvider === "apple-container" || existingProvider === "docker"
      ? existingProvider
      : defaultSandboxProvider();
  const provider = assertNotCancelled(
    await select({
      message: "Agent sandbox",
      options: [
        { value: "apple-container" as const, label: "apple-container" },
        { value: "docker" as const, label: "docker" },
      ],
      initialValue: defaultProvider,
    }),
  );

  document = setEnvValue(document, "BETTER_AUTH_SECRET", secretValue);
  document = setEnvValue(document, "BETTER_AUTH_URL", authUrl.trim());
  document = setEnvValue(document, "SWEAT_GUI_ORIGIN", guiOrigin.trim());
  document = setEnvValue(document, "SWEAT_SANDBOX_PROVIDER", provider);
  document = setEnvValue(
    document,
    "SWEAT_AGENT_IMAGE",
    existing("SWEAT_AGENT_IMAGE") ?? defaultAgentImage,
  );
  if (provider === "docker") {
    const configuredCaCertificate = (
      await askText(
        "Agent CA certificate bundle (optional)",
        existing("SWEAT_AGENT_CA_CERT"),
      )
    ).trim();
    if (configuredCaCertificate) {
      const caCertificate = isAbsolute(configuredCaCertificate)
        ? configuredCaCertificate
        : resolve(root, configuredCaCertificate);
      if (!(await stat(caCertificate)).isFile()) {
        throw new Error(`Agent CA certificate is not a file: ${caCertificate}`);
      }
      document = setEnvValue(document, "SWEAT_AGENT_CA_CERT", caCertificate);
    }
  }

  const initialIntegrations: Integration[] = [];
  if (existing("SWEAT_GITHUB_REPOSITORY")) initialIntegrations.push("github");
  if (existing("LINEAR_MCP_API_KEY")) initialIntegrations.push("linear");
  if (existing("ASANA_API_TOKEN") || existing("ASANA_PROJECT_GID"))
    initialIntegrations.push("asana");
  if (existing("OUTLINE_URL") || existing("OUTLINE_API_KEY"))
    initialIntegrations.push("outline");

  const integrations = assertNotCancelled(
    await multiselect({
      message: "Optional integrations",
      options: [
        { value: "github" as const, label: "GitHub", hint: "repo + base branch" },
        { value: "linear" as const, label: "Linear", hint: "MCP API key" },
        {
          value: "asana" as const,
          label: "Asana",
          hint: "token + project GID",
        },
        {
          value: "outline" as const,
          label: "Outline",
          hint: "instance URL + API key",
        },
      ],
      initialValues: initialIntegrations,
      required: false,
    }),
  );
  const useGitHub = integrations.includes("github");
  const useLinear = integrations.includes("linear");
  const useAsana = integrations.includes("asana");
  const useOutline = integrations.includes("outline");

  if (useGitHub) {
    await requireGitHubCli();
    document = setEnvValue(
      document,
      "SWEAT_GITHUB_REPOSITORY",
      (
        await askText(
          "GitHub repository (owner/name)",
          existing("SWEAT_GITHUB_REPOSITORY"),
          (value) =>
            value.trim() ? undefined : "GitHub repository is required",
        )
      ).trim(),
    );
    document = setEnvValue(
      document,
      "SWEAT_GITHUB_BASE",
      (
        await askText(
          "GitHub base branch",
          existing("SWEAT_GITHUB_BASE") ?? "main",
          (value) => (value.trim() ? undefined : "GitHub base branch is required"),
        )
      ).trim(),
    );
    const verify = (
      await askText(
        "Verification command (optional)",
        existing("SWEAT_VERIFY_COMMAND"),
      )
    ).trim();
    if (verify) document = setEnvValue(document, "SWEAT_VERIFY_COMMAND", verify);
  }
  if (useLinear) {
    const token = await askSecret(
      "Linear API key",
      existing("LINEAR_MCP_API_KEY"),
    );
    if (!token)
      throw new Error("A Linear API key is required when Linear is selected.");
    document = setEnvValue(document, "LINEAR_MCP_API_KEY", token);
  }
  if (useAsana) {
    const token = await askSecret("Asana API token", existing("ASANA_API_TOKEN"));
    const projectGid = (
      await askText(
        "Asana project GID",
        existing("ASANA_PROJECT_GID"),
        (value) =>
          value.trim() || existing("ASANA_PROJECT_GID")
            ? undefined
            : "Asana project GID is required",
      )
    ).trim();
    if (!token || !projectGid)
      throw new Error(
        "An Asana API token and project GID are required when Asana is selected.",
      );
    document = setEnvValue(document, "ASANA_API_TOKEN", token);
    document = setEnvValue(document, "ASANA_PROJECT_GID", projectGid);
  }
  if (useOutline) {
    const outlineUrl = (
      await askText(
        "Outline URL (without /mcp)",
        existing("OUTLINE_URL"),
        (value) => (value.trim() ? undefined : "Outline URL is required"),
      )
    )
      .trim()
      .replace(/\/$/, "");
    const apiKey = await askSecret(
      "Outline API key",
      existing("OUTLINE_API_KEY"),
    );
    if (!outlineUrl || !apiKey)
      throw new Error(
        "An Outline URL and API key are required when Outline is selected.",
      );
    document = setEnvValue(document, "OUTLINE_URL", outlineUrl);
    document = setEnvValue(document, "OUTLINE_API_KEY", apiKey);
  }

  const preparing = spinner();
  preparing.start("Preparing agent runtime...");
  try {
    const rootlessDocker = await requireRuntime(provider);
    if (rootlessDocker) {
      await configureRootlessDocker();
      document = setEnvValue(
        document,
        "SWEAT_MCP_HOST",
        existing("SWEAT_MCP_HOST") ?? rootlessDockerMcpHost,
      );
    }
    preparing.stop("Agent runtime ready");
  } catch (error) {
    preparing.stop("Agent runtime setup failed");
    throw error;
  }

  await saveEnv(path, current, document);

  log.step("Installing project dependencies...");
  await run("bun", ["install", "--cwd", "project", "--frozen-lockfile"]);
  log.step("Installing GUI dependencies...");
  await run("bun", ["install", "--cwd", "project/gui", "--frozen-lockfile"]);
  const commandEnv = { ...process.env, ENV_FILE: path };
  log.step("Building agent image...");
  await run("make", ["agent"], { env: commandEnv });
  log.step("Running database migrations...");
  await run("make", ["migrate"], { env: commandEnv });

  outro("Server setup complete. Start it with `make server` or `make dev`.");
}

async function installMacApplication(): Promise<void> {
  if (process.platform !== "darwin")
    throw new Error("The macOS application can only be installed on macOS.");

  const checking = spinner();
  checking.start("Checking for the latest Sweat release...");
  let asset: ReleaseAsset;
  try {
    const response = await fetch(releaseApi, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "sweat-setup",
      },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok)
      throw new Error(
        `Could not read the latest GitHub release (${response.status}).`,
      );
    const release = (await response.json()) as { assets?: ReleaseAsset[] };
    const selected = selectUniversalDmg(release.assets ?? []);
    if (!selected)
      throw new Error(
        "The latest GitHub release does not contain a universal macOS DMG.",
      );
    asset = selected;
    checking.stop(`Found ${asset.name}`);
  } catch (error) {
    checking.stop("Could not find the latest release");
    throw error;
  }

  const download = await fetch(asset.browser_download_url, {
    signal: AbortSignal.timeout(120_000),
  });
  if (!download.ok)
    throw new Error(`Could not download ${asset.name} (${download.status}).`);
  const path = join(tmpdir(), asset.name);
  const body = download.body;
  if (!body)
    throw new Error(`Could not download ${asset.name}: empty response.`);
  const writer = Bun.file(path).writer();
  const reader = body.getReader();
  const total = Number(download.headers.get("content-length"));
  const totalLabel =
    Number.isFinite(total) && total > 0 ? ` / ${formatBytes(total)}` : "";
  let downloaded = 0;
  let completed = false;
  process.stdout.write(`Downloading ${asset.name}: 0 B${totalLabel}`);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      await writer.write(chunk.value);
      downloaded += chunk.value.byteLength;
      process.stdout.write(
        `\rDownloading ${asset.name}: ${formatBytes(downloaded)}${totalLabel}`,
      );
    }
    await writer.end();
    completed = true;
  } finally {
    reader.releaseLock();
    if (!completed) {
      await writer.end().catch(() => undefined);
      await rm(path, { force: true });
    }
  }
  process.stdout.write("\n");
  console.log(`Downloaded ${formatBytes(downloaded)} to ${path}.`);
  console.log("Opening the installer...");
  await run("open", [path]);
  outro(
    `Opened ${path}. Drag Sweat to Applications to finish installation.`,
  );
}

export async function runSetup(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("make setup requires an interactive terminal.");
  }

  intro("Sweat setup");
  const choice = assertNotCancelled(
    await select({
      message: "What do you want to set up?",
      options: [
        { value: "server" as const, label: "Server setup" },
        { value: "mac" as const, label: "Install mac application" },
        { value: "exit" as const, label: "Exit" },
      ],
    }),
  );
  if (choice === "server") await configureServer(envPath());
  else if (choice === "mac") await installMacApplication();
  else cancel("Setup cancelled");
}

if (import.meta.main) {
  runSetup().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
