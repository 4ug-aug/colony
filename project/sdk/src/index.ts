export type Stdio = "capture" | "inherit";

export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdio?: Stdio;
}

export interface CommandResult {
  args: readonly string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandRunner {
  run(args: readonly string[], options?: CommandOptions): Promise<CommandResult>;
}

export class BunCommandRunner implements CommandRunner {
  constructor(private readonly binary = "container") {}

  async run(
    args: readonly string[],
    options: CommandOptions = {},
  ): Promise<CommandResult> {
    const command = [this.binary, ...args];
    const capture = options.stdio !== "inherit";
    const process = Bun.spawn(command, {
      cwd: options.cwd,
      env: options.env ? { ...Bun.env, ...options.env } : undefined,
      stdin: capture ? "ignore" : "inherit",
      stdout: capture ? "pipe" : "inherit",
      stderr: capture ? "pipe" : "inherit",
    });

    const [exitCode, stdout, stderr] = await Promise.all([
      process.exited,
      capture ? new Response(process.stdout).text() : "",
      capture ? new Response(process.stderr).text() : "",
    ]);

    return { args, exitCode, stdout, stderr };
  }
}

export class ContainerCommandError extends Error {
  readonly result: CommandResult;

  constructor(result: CommandResult) {
    const safeResult = {
      ...result,
      args: result.args.map((arg) =>
        /^(?:[^=]*_)?(?:API_)?(?:KEY|TOKEN|SECRET|PASSWORD)=/.test(arg)
          ? `${arg.slice(0, arg.indexOf("=") + 1)}[redacted]`
          : arg,
      ),
    };
    super(
      `container ${safeResult.args.join(" ")} exited with code ${safeResult.exitCode}${
        safeResult.stderr.trim() ? `: ${safeResult.stderr.trim()}` : ""
      }`,
    );
    this.result = safeResult;
    this.name = "ContainerCommandError";
  }
}

export type JsonObject = Record<string, unknown>;

export interface RunOptions {
  name?: string;
  command?: readonly string[];
  detach?: boolean;
  remove?: boolean;
  interactive?: boolean;
  tty?: boolean;
  env?: Record<string, string | undefined>;
  volumes?: readonly string[];
  publish?: readonly string[];
  cpus?: number;
  memory?: string;
  platform?: string;
  workdir?: string;
  stdio?: Stdio;
}

export interface ExecOptions {
  detach?: boolean;
  interactive?: boolean;
  tty?: boolean;
  env?: Record<string, string | undefined>;
  workdir?: string;
  stdio?: Stdio;
}

export interface ContainerOperations {
  run(image: string, options?: RunOptions): Promise<CommandResult>;
  list<T = JsonObject>(options?: { all?: boolean }): Promise<T[]>;
  inspect<T = unknown>(ids: readonly string[]): Promise<T>;
  exec(
    id: string,
    command: readonly string[],
    options?: ExecOptions,
  ): Promise<CommandResult>;
  stop(ids: readonly string[], options?: { timeout?: number }): Promise<void>;
  remove(ids: readonly string[], options?: { force?: boolean }): Promise<void>;
}

export interface ImageOperations {
  pull(reference: string, options?: { platform?: string }): Promise<void>;
  push(reference: string, options?: { platform?: string }): Promise<void>;
  tag(source: string, target: string): Promise<void>;
  list<T = JsonObject>(): Promise<T[]>;
}

export interface SystemOperations {
  start(): Promise<void>;
  stop(): Promise<void>;
  status<T = unknown>(): Promise<T>;
}

export interface AppleContainerClient {
  containers: ContainerOperations;
  images: ImageOperations;
  system: SystemOperations;
  raw(
    args: readonly string[],
    options?: CommandOptions,
  ): Promise<CommandResult>;
}

async function checked(
  runner: CommandRunner,
  args: readonly string[],
  options?: CommandOptions,
): Promise<CommandResult> {
  const result = await runner.run(args, options);
  if (result.exitCode !== 0) throw new ContainerCommandError(result);
  return result;
}

function json<T>(result: CommandResult): T {
  return JSON.parse(result.stdout) as T;
}

function addProcessOptions(
  args: string[],
  options: Pick<
    RunOptions,
    "interactive" | "tty" | "env" | "workdir"
  >,
): void {
  if (options.interactive) args.push("--interactive");
  if (options.tty) args.push("--tty");
  if (options.workdir) args.push("--workdir", options.workdir);
  for (const [key, value] of Object.entries(options.env ?? {})) {
    args.push("--env", value === undefined ? key : `${key}=${value}`);
  }
}

export function createContainerOperations(
  runner: CommandRunner,
): ContainerOperations {
  return {
    async run(image, options = {}) {
      const args = ["run"];
      addProcessOptions(args, options);
      if (options.name) args.push("--name", options.name);
      if (options.detach) args.push("--detach");
      if (options.remove) args.push("--rm");
      if (options.cpus !== undefined) args.push("--cpus", String(options.cpus));
      if (options.memory) args.push("--memory", options.memory);
      if (options.platform) args.push("--platform", options.platform);
      for (const volume of options.volumes ?? []) args.push("--volume", volume);
      for (const port of options.publish ?? []) args.push("--publish", port);
      args.push(image, ...(options.command ?? []));

      return checked(runner, args, {
        stdio:
          options.stdio ??
          (options.interactive || options.tty ? "inherit" : "capture"),
      });
    },

    async list<T = JsonObject>({ all = false } = {}) {
      const args = ["list", "--format", "json"];
      if (all) args.push("--all");
      return json<T[]>(await checked(runner, args));
    },

    async inspect<T = unknown>(ids: readonly string[]) {
      return json<T>(await checked(runner, ["inspect", ...ids]));
    },

    exec(id, command, options = {}) {
      const args = ["exec"];
      addProcessOptions(args, options);
      if (options.detach) args.push("--detach");
      args.push(id, ...command);
      return checked(runner, args, {
        stdio:
          options.stdio ??
          (options.interactive || options.tty ? "inherit" : "capture"),
      });
    },

    async stop(ids, options = {}) {
      const args = ["stop"];
      if (options.timeout !== undefined) {
        args.push("--time", String(options.timeout));
      }
      await checked(runner, [...args, ...ids]);
    },

    async remove(ids, options = {}) {
      await checked(runner, [
        "delete",
        ...(options.force ? ["--force"] : []),
        ...ids,
      ]);
    },
  };
}

export function createImageOperations(runner: CommandRunner): ImageOperations {
  return {
    async pull(reference, options = {}) {
      await checked(runner, [
        "image",
        "pull",
        ...(options.platform ? ["--platform", options.platform] : []),
        reference,
      ]);
    },

    async push(reference, options = {}) {
      await checked(runner, [
        "image",
        "push",
        ...(options.platform ? ["--platform", options.platform] : []),
        reference,
      ]);
    },

    async tag(source, target) {
      await checked(runner, ["image", "tag", source, target]);
    },

    async list<T = JsonObject>() {
      return json<T[]>(
        await checked(runner, ["image", "list", "--format", "json"]),
      );
    },
  };
}

export function createSystemOperations(
  runner: CommandRunner,
): SystemOperations {
  return {
    async start() {
      await checked(runner, ["system", "start"], { stdio: "inherit" });
    },

    async stop() {
      await checked(runner, ["system", "stop"]);
    },

    async status<T = unknown>() {
      return json<T>(
        await checked(runner, ["system", "status", "--format", "json"]),
      );
    },
  };
}

export function createAppleContainerClient(
  runner: CommandRunner = new BunCommandRunner(),
): AppleContainerClient {
  return {
    containers: createContainerOperations(runner),
    images: createImageOperations(runner),
    system: createSystemOperations(runner),
    raw: (args, options) => checked(runner, args, options),
  };
}
