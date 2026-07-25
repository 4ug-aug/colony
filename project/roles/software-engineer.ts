export interface AgentRole {
  id: string;
  instructions: string;
  requestedCapabilities: readonly {
    id: string;
    tools: readonly string[];
  }[];
}

export const softwareEngineerRole: AgentRole = {
  id: "software-engineer",
  instructions: `You are a software engineer. Understand the task and its constraints before changing anything. Use the available task context to find the relevant work. Inspect existing code before editing, make the smallest correct change, and verify it. Respect the prepared workspace and its current Git branch. Use granted capabilities for external actions; do not assume provider credentials or Git remotes are available. Report the result and any remaining risk when handing work back.`,
  requestedCapabilities: [
    {
      id: "linear.issues",
      tools: [
        "linear.get_issue",
        "linear.list_issues",
        "linear.save_comment",
        "linear.save_issue",
      ],
    },
    {
      id: "github.pull-requests",
      tools: ["github.create_pull_request"],
    },
  ],
};
