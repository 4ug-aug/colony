import { parseStep } from "../runtime/step";
import type { AgentProvider, RuntimeRequest } from "../runs";

/**
 * Shared NDJSON stdout → step runtime used by Cursor and OpenAI Agents providers.
 */
export function createStdoutStepRuntime(options: {
  command: (request: RuntimeRequest) => readonly string[];
  env: (request: RuntimeRequest) => Record<string, string>;
}): AgentProvider {
  return {
    run: async (sandbox, request: RuntimeRequest) => {
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
    },
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
