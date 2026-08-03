// Client-safe roster presentation. This module must not import role modules:
// role instructions are server-owned and would otherwise ship in the GUI bundle.

import type { AgentRuntimeKind } from "./definition";

export const SOFTWARE_ENGINEER_ID = "software-engineer";
export const ANTBOY_ID = "antboy";

export const capabilityPresentation: Record<
  string,
  { name: string; tools: Record<string, string> }
> = {
  "linear.issues": {
    name: "Linear issues",
    tools: {
      "linear.get_issue": "Get issues",
      "linear.list_issues": "List issues",
      "linear.save_comment": "Save comments",
      "linear.save_issue": "Save issues",
    },
  },
  "asana.tasks": {
    name: "Asana tasks",
    tools: {
      "asana.get_project": "Get project",
      "asana.create_task": "Create tasks",
      "asana.list_tasks": "List tasks",
      "asana.get_task": "Get task details",
      "asana.get_task_comments": "Read comments",
      "asana.set_task_completion": "Update completion",
      "asana.add_task_comment": "Add comments",
    },
  },
  "github.pull-requests": {
    name: "GitHub pull requests",
    tools: {
      "github.create_pull_request": "Create pull requests",
      "github.wait_for_pull_request_checks": "Wait for pull request checks",
    },
  },
  "workspace.room": {
    name: "Room",
    tools: {
      "workspace.read_messages": "Read messages",
      "workspace.post_message": "Post messages",
    },
  },
};

export type WorkspacePerson = {
  id: string;
  name: string;
  description: string;
  kind: AgentRuntimeKind;
  includeRepository: boolean;
};

/** Single source of truth for who is in the workspace and how they present. */
export const WORKSPACE_PEOPLE: readonly WorkspacePerson[] = [
  {
    id: SOFTWARE_ENGINEER_ID,
    name: "Software engineer",
    description: "Build, debug, and review code in a checked-out repository.",
    kind: "cursor",
    includeRepository: true,
  },
  {
    id: ANTBOY_ID,
    name: "antboy",
    description:
      "Collaborative teammate for room and task work without a GitHub checkout.",
    kind: "openai-agents",
    includeRepository: false,
  },
];

export function rosterPerson(id: string): WorkspacePerson | undefined {
  return WORKSPACE_PEOPLE.find((person) => person.id === id);
}

export function rosterMentionHandles(): ReadonlySet<string> {
  return new Set(WORKSPACE_PEOPLE.map((person) => person.id));
}

export function rosterMentionPattern(): RegExp {
  const ids = WORKSPACE_PEOPLE.map((person) =>
    person.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  ).join("|");
  return new RegExp(`(^|\\s)@(${ids})\\b\\s*`);
}

export function rosterParticipant(id: string): {
  id: string;
  name: string;
  image?: string;
} {
  const person = rosterPerson(id);
  return person ? { id: person.id, name: person.name } : { id, name: id };
}

export function rosterNotConfiguredMessage(kind: AgentRuntimeKind): string {
  return kind === "cursor"
    ? "Cursor agent runtime is not configured"
    : "LLM provider is not configured";
}
