import { parseStep } from "../runtime/step";
import type { AgentProvider, RuntimeRequest } from "../runs";

export function createCursorSdkRuntime(options: {
  command?: readonly string[];
} = {}): AgentProvider {
  return {
    run: async (sandbox, request: RuntimeRequest) => {
      const cursor = request.definition.runtime.cursor;
      if (!cursor) {
        throw new Error(
          `Agent definition ${request.definition.id} has no Cursor runtime configuration`,
        );
      }

      let stdoutBuffer = "";
      let finalMessage = "";

      const flushLine = (line: string): void => {
        const step = parseStep(line);
        if (!step) return;
        if (step.kind === "message") finalMessage = step.text;
        request.onStep?.(step);
      };

      const result = await sandbox.exec({
        command:
          options.command ?? [
            "node",
            "--experimental-strip-types",
            "--no-warnings=ExperimentalWarning",
            "/app/runtime/cursor-cli.ts",
          ],
        env: {
          SWEAT_AGENT_TASK: request.task,
          SWEAT_AGENT_ID: request.definition.id,
          SWEAT_AGENT_INSTRUCTIONS: request.definition.instructions,
          SWEAT_CURSOR_API_KEY: cursor.apiKey,
          SWEAT_CURSOR_MODEL: cursor.model,
          // Packages live under /app; sandbox workdir is /work for the agent cwd.
          NODE_PATH: "/app/node_modules",
          ...(request.capabilitySession
            ? {
                SWEAT_MCP_URL: request.capabilitySession.url,
                SWEAT_MCP_TOKEN: request.capabilitySession.token,
                SWEAT_MCP_ALLOWED_TOOLS:
                  request.capabilitySession.allowedTools.join(","),
              }
            : {}),
        },
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
