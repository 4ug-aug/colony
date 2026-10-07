import type { McpUpstream } from "./gateway";

export type WorkspaceSchedule = {
  id: string;
  name: string;
  agentDefinitionId: string;
  task: string;
  cronExpression: string;
  timezone: string;
  state: "active" | "paused" | "archived";
  nextRunAt?: number;
};

export interface WorkspaceSchedulesPort {
  listSchedules(): WorkspaceSchedule[];
  /** Validates the untrusted fields; throws with a message for the agent. */
  createSchedule(
    input: Record<string, unknown>,
    responsibleAccountId: string,
  ): WorkspaceSchedule;
  /** Changes only the fields given; validates them like createSchedule. */
  updateSchedule(
    id: string,
    input: Record<string, unknown>,
    responsibleAccountId: string,
  ): WorkspaceSchedule;
}

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function createWorkspaceSchedulesMcpUpstream(options: {
  port: WorkspaceSchedulesPort;
  responsibleAccountId: string;
  /** The calling agent; a new schedule runs as it unless another is named. */
  agentDefinitionId: string;
}): McpUpstream {
  return {
    async listTools() {
      return [
        {
          name: "workspace.list_schedules",
          description:
            "List the workspace's active and paused Schedules: id, name, agent, task, cron expression, timezone, state, and next run time.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "workspace.create_schedule",
          description:
            "Create a recurring Schedule on behalf of this run's Responsible Account, who owns it. Each run starts the agent with `task` as its whole instruction, so write it self-contained. Defaults to you as the agent.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string", description: "Short name, at most 50 characters." },
              task: { type: "string", description: "What the agent should do on every run." },
              cronExpression: {
                type: "string",
                description: "Five-field cron, e.g. `0 9 * * 1-5` for 09:00 on weekdays.",
              },
              timezone: {
                type: "string",
                description: "IANA timezone the cron is read in, e.g. `Europe/Copenhagen`.",
              },
              agentDefinitionId: {
                type: "string",
                description: "Agent id (slug) to run; use workspace.list_agents to find one.",
              },
            },
            required: ["name", "task", "cronExpression", "timezone"],
          },
        },
        {
          name: "workspace.update_schedule",
          description:
            "Change a Schedule by id. Only the fields you pass change. Set `state` to `paused` to stop it, `active` to resume it, or `archived` to retire it. An archived Schedule can only come back paused.",
          inputSchema: {
            type: "object",
            properties: {
              id: { type: "string", description: "Schedule id from workspace.list_schedules." },
              name: { type: "string", description: "Short name, at most 50 characters." },
              task: { type: "string", description: "What the agent should do on every run." },
              cronExpression: { type: "string", description: "Five-field cron." },
              timezone: { type: "string", description: "IANA timezone the cron is read in." },
              agentDefinitionId: { type: "string", description: "Agent id (slug) to run." },
              state: { type: "string", enum: ["active", "paused", "archived"] },
            },
            required: ["id"],
          },
        },
      ];
    },
    async callTool(name, args) {
      if (name === "workspace.list_schedules")
        return textResult(options.port.listSchedules());
      if (name === "workspace.create_schedule")
        return textResult(
          options.port.createSchedule(
            {
              ...args,
              agentDefinitionId:
                args.agentDefinitionId ?? options.agentDefinitionId,
            },
            options.responsibleAccountId,
          ),
        );
      if (name === "workspace.update_schedule") {
        const { id, ...input } = args;
        if (typeof id !== "string" || !id) throw new Error("id is required");
        return textResult(
          options.port.updateSchedule(id, input, options.responsibleAccountId),
        );
      }
      throw new Error(`Unknown tool: ${name}`);
    },
  };
}
