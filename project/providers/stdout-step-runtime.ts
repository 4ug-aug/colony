import { parseStep } from "../runtime/step";
import type { AgentProvider, RuntimeRequest } from "../runs";

/**
 * Shared NDJSON stdout → step runtime used by Cursor and OpenAI Agents providers.
 */
export function createStdoutStepRuntime(options: {
  command: (request: RuntimeRequest) => readonly string[];
  env: (request: RuntimeRequest) => Record<string, string>;
}): AgentProvider {
  const runOnce = async (
    sandbox: Parameters<AgentProvider["run"]>[0],
    request: RuntimeRequest,
  ) => {
    let stdoutBuffer = "";
    let finalMessage = "";

    const flushLine = (line: string): void => {
      const step = parseStep(line);
      if (!step) return;
      if (step.kind === "message") finalMessage = step.text;
      request.onStep?.(step);
    };

    const result = await sandbox.exec({
      command: [...options.command(request)],
      env: options.env(request),
      ...(request.workspace ? { workdir: request.workspace } : {}),
      onOutput: (chunk) => {
        if (chunk.stream === "stderr") {
          request.onOutput?.(chunk);
          return;
        }
        stdoutBuffer += chunk.text;
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop()!;
        for (const line of lines) {
          flushLine(line);
        }
      },
    });

    if (stdoutBuffer) {
      flushLine(stdoutBuffer);
    }

    return {
      exitCode: result.exitCode,
      stdout: finalMessage,
      stderr: result.stderr,
    };
  };

  return {
    run: runOnce,
    // Warm path: keep the sandbox; each turn re-enters the CLI. Cursor resume /
    // OpenAI MemorySession continuity live in the in-container runtimes; the
    // executor holds MCP + sandbox across turns (ADR 0020).
    openWarmSession: async (sandbox, baseRequest) => ({
      runTurn: (task) => runOnce(sandbox, { ...baseRequest, task }),
      dispose: async () => {},
    }),
  };
}

export function capabilitySessionEnv(
  request: RuntimeRequest,
): Record<string, string> {
  if (!request.capabilitySession) return {};
  return {
    SWEAT_MCP_URL: request.capabilitySession.url,
    SWEAT_MCP_TOKEN: request.capabilitySession.token,
    SWEAT_MCP_ALLOWED_TOOLS: request.capabilitySession.allowedTools.join(","),
  };
}
