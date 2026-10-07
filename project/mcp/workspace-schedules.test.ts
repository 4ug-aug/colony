import { expect, test } from "bun:test";
import {
  createWorkspaceSchedulesMcpUpstream,
  type WorkspaceSchedule,
} from "./workspace-schedules";

const schedule: WorkspaceSchedule = {
  id: "schedule-1",
  name: "Standup digest",
  agentDefinitionId: "antboy",
  task: "Summarise yesterday's issues",
  cronExpression: "0 9 * * 1-5",
  timezone: "Europe/Copenhagen",
  state: "active",
};

test("create_schedule runs as the calling agent for the Responsible Account unless told otherwise", async () => {
  const created: [Record<string, unknown>, string][] = [];
  const upstream = createWorkspaceSchedulesMcpUpstream({
    port: {
      listSchedules: () => [schedule],
      createSchedule: (input, responsibleAccountId) => {
        created.push([input, responsibleAccountId]);
        return schedule;
      },
      updateSchedule: () => schedule,
    },
    responsibleAccountId: "ada",
    agentDefinitionId: "antboy",
  });
  const fields = {
    name: "Standup digest",
    task: "Summarise yesterday's issues",
    cronExpression: "0 9 * * 1-5",
    timezone: "Europe/Copenhagen",
  };

  await upstream.callTool("workspace.create_schedule", fields);
  await upstream.callTool("workspace.create_schedule", {
    ...fields,
    agentDefinitionId: "software-engineer",
  });

  expect(created).toEqual([
    [{ ...fields, agentDefinitionId: "antboy" }, "ada"],
    [{ ...fields, agentDefinitionId: "software-engineer" }, "ada"],
  ]);
  expect(
    (await upstream.listTools()).map(({ name }) => name),
  ).toEqual([
    "workspace.list_schedules",
    "workspace.create_schedule",
    "workspace.update_schedule",
  ]);
  const listed = await upstream.callTool("workspace.list_schedules", {});
  expect(JSON.stringify(listed)).toContain("Standup digest");
});

test("update_schedule passes only the named schedule and fields on for the Responsible Account", async () => {
  const updated: [string, Record<string, unknown>, string][] = [];
  const upstream = createWorkspaceSchedulesMcpUpstream({
    port: {
      listSchedules: () => [schedule],
      createSchedule: () => schedule,
      updateSchedule: (id, input, responsibleAccountId) => {
        updated.push([id, input, responsibleAccountId]);
        return { ...schedule, state: "paused" };
      },
    },
    responsibleAccountId: "ada",
    agentDefinitionId: "antboy",
  });

  const result = await upstream.callTool("workspace.update_schedule", {
    id: "schedule-1",
    state: "paused",
  });

  expect(updated).toEqual([["schedule-1", { state: "paused" }, "ada"]]);
  expect(JSON.stringify(result)).toContain("paused");
  await expect(upstream.callTool("workspace.update_schedule", { state: "paused" })).rejects.toThrow(
    "id is required",
  );
});
