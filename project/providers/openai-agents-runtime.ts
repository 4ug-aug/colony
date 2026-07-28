import { parseStep } from "../agents";
import type { AgentProvider, RuntimeRequest } from "../agents";

export function createOpenAIAgentsRuntime(options: {
  command?: readonly string[];
} = {}): AgentProvider {
  return {
    run: async (sandbox, request: RuntimeRequest) => {
      const model = request.definition.runtime.model;
      if (!model) {
        throw new Error(`Agent definition ${request.definition.id} has no model configuration`);
      }

      let stdoutBuffer = "";
      // The agent's final answer is its handoff/result. It arrives as the last
      // `message` step; capture it as the run's stdout so the room shows the
      // result. The full narration lives in the steps, not in stdout.
      let finalMessage = "";

      const flushLine = (line: string): void => {
        const step = parseStep(line);
        if (!step) return;
        if (step.kind === "message") finalMessage = step.text;
        request.onStep?.(step);
      };

      const result = await sandbox.exec({
        command: options.command ?? ["bun", "run", "/app/runtime/cli.ts"],
        env: {
          SWEAT_AGENT_TASK: request.task,
          SWEAT_AGENT_ID: request.definition.id,
          SWEAT_AGENT_INSTRUCTIONS: request.definition.instructions,
          SWEAT_MODEL_BASE_URL: model.baseUrl,
          SWEAT_MODEL_API_KEY: model.apiKey,
          SWEAT_MODEL_NAME: model.model,
          ...(request.capabilitySession
            ? {
                SWEAT_MCP_URL: request.capabilitySession.url,
                SWEAT_MCP_TOKEN: request.capabilitySession.token,
                SWEAT_MCP_ALLOWED_TOOLS: request.capabilitySession.allowedTools.join(","),
              }
            : {}),
        },
        ...(request.workspace ? { workdir: request.workspace } : {}),
        onOutput: (chunk) => {
          if (chunk.stream === "stderr") {
            request.onOutput?.(chunk);
            return;
          }
          // stdout: buffer and split on newlines
          stdoutBuffer += chunk.text;
          const lines = stdoutBuffer.split("\n");
          // All but the last element are complete lines
          stdoutBuffer = lines.pop()!;
          for (const line of lines) {
            flushLine(line);
          }
        },
      });

      // Flush any trailing partial line (no final newline)
      if (stdoutBuffer) {
        flushLine(stdoutBuffer);
      }

      return { exitCode: result.exitCode, stdout: finalMessage, stderr: result.stderr };
    },
  };
}
