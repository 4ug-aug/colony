import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { readEnvValue } from "./setup";

export type SystemdUnitOptions = {
  bun: string;
  database: string;
  envFile: string;
  /** Host TLS trust for Outline/MCP; must be set before Bun starts. */
  nodeExtraCaCerts?: string;
  path: string;
  workingDirectory: string;
};

const unitValue = (value: string): string => {
  if (/[\0\r\n]/.test(value))
    throw new Error("Systemd values cannot contain newlines");
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("%", "%%")}"`;
};

const unitPathValue = (value: string): string => {
  if (/[\0\r\n]/.test(value))
    throw new Error("Systemd values cannot contain newlines");
  return value
    .replaceAll("\\", "\\x5c")
    .replaceAll(" ", "\\x20")
    .replaceAll("\t", "\\x09")
    .replaceAll("%", "%%");
};

export function renderSystemdUnit(options: SystemdUnitOptions): string {
  const command = [
    options.bun,
    `--env-file=${options.envFile}`,
    "run",
    "src/server/coordinator.ts",
  ]
    .map(unitValue)
    .join(" ");

  const extraCa = options.nodeExtraCaCerts
    ? `Environment=${unitValue(`NODE_EXTRA_CA_CERTS=${options.nodeExtraCaCerts}`)}\n`
    : "";

  return `[Unit]
Description=Sweat server

[Service]
WorkingDirectory=${unitPathValue(options.workingDirectory)}
ExecStart=${command}
Environment=${unitValue(`SWEAT_DATABASE_PATH=${options.database}`)}
Environment=${unitValue(`PATH=${options.path}`)}
${extraCa}Restart=on-failure
RestartSec=5s
TimeoutStopSec=30s

[Install]
WantedBy=default.target
`;
}

export function requireLinux(
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== "linux")
    throw new Error(
      "Background server installation currently supports Linux only",
    );
}

async function run(
  command: string,
  args: readonly string[],
  cwd?: string,
): Promise<void> {
  const child = Bun.spawn([command, ...args], {
    cwd,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await child.exited) !== 0)
    throw new Error(`Command failed: ${command} ${args.join(" ")}`);
}

const root = join(import.meta.dir, "..");
const envFile = (() => {
  const configured = process.env.ENV_FILE ?? join(root, ".env.local");
  return isAbsolute(configured) ? configured : join(root, configured);
})();
const database = (() => {
  const configured =
    process.env.SWEAT_DATABASE_PATH ?? join(root, "project/gui/sweat.sqlite");
  return isAbsolute(configured) ? configured : join(root, configured);
})();
const unitDirectory = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"),
  "systemd/user",
);
const unitPath = join(unitDirectory, "sweat.service");

async function resolveNodeExtraCaCerts(document: string): Promise<
  string | undefined
> {
  const configured =
    process.env.NODE_EXTRA_CA_CERTS ??
    readEnvValue(document, "NODE_EXTRA_CA_CERTS");
  if (!configured) return undefined;
  const caCertificate = isAbsolute(configured)
    ? configured
    : resolve(root, configured);
  if (!(await stat(caCertificate)).isFile()) {
    throw new Error(`NODE_EXTRA_CA_CERTS is not a file: ${caCertificate}`);
  }
  return caCertificate;
}

async function install(): Promise<void> {
  const document = await readFile(envFile, "utf8");
  const nodeExtraCaCerts = await resolveNodeExtraCaCerts(document);
  const systemctl = Bun.which("systemctl");
  const loginctl = Bun.which("loginctl");
  if (!systemctl || !loginctl)
    throw new Error("systemctl and loginctl are required");
  const path = process.env.PATH;
  if (!path) throw new Error("PATH is required");

  await run("make", ["--no-print-directory", "agent"], root);
  await run(loginctl, ["enable-linger", userInfo().username]);
  await mkdir(unitDirectory, { recursive: true });
  await writeFile(
    unitPath,
    renderSystemdUnit({
      bun: process.execPath,
      database,
      envFile,
      ...(nodeExtraCaCerts ? { nodeExtraCaCerts } : {}),
      path,
      workingDirectory: join(root, "project/gui"),
    }),
    { mode: 0o644 },
  );
  await run(systemctl, ["--user", "daemon-reload"]);
  await run(systemctl, ["--user", "enable", "sweat.service"]);
  await run(systemctl, ["--user", "restart", "sweat.service"]);
  console.log(
    "Sweat is running. Check it with `systemctl --user status sweat`.",
  );
}

async function uninstall(): Promise<void> {
  const systemctl = Bun.which("systemctl");
  if (!systemctl) throw new Error("systemctl is required");
  await run(systemctl, ["--user", "disable", "--now", "sweat.service"]);
  await rm(unitPath, { force: true });
  await run(systemctl, ["--user", "daemon-reload"]);
  console.log(
    "Removed the Sweat background server. User lingering was left unchanged.",
  );
}

export async function manageService(action: string | undefined): Promise<void> {
  requireLinux();
  if (action === "install") await install();
  else if (action === "uninstall") await uninstall();
  else throw new Error("Usage: bun scripts/service.ts install|uninstall");
}

if (import.meta.main) {
  manageService(process.argv[2]).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
