import type { McpUpstream } from "./gateway";

export type WorkspaceDocSummary = {
  id: string;
  title: string;
  createdBy: { id: string; name: string; image?: string };
  createdAt: number;
  updatedAt: number;
};

export type WorkspaceDoc = WorkspaceDocSummary & { body: string };

export interface WorkspaceDocsPort {
  listDocs(): WorkspaceDocSummary[];
  getDoc(id: string): WorkspaceDoc | undefined;
}

const textResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});

export function createWorkspaceDocsMcpUpstream(options: {
  port: WorkspaceDocsPort;
}): McpUpstream {
  return {
    async listTools() {
      return [
        {
          name: "workspace.list_docs",
          description:
            "List Sweat workspace Docs with ids, titles, authors, and timestamps. Use workspace.get_doc to read the markdown body.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          name: "workspace.get_doc",
          description: "Read one Sweat workspace Doc, including its markdown body.",
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      ];
    },

    async callTool(name, args) {
      if (name === "workspace.list_docs")
        return textResult(options.port.listDocs());
      if (name === "workspace.get_doc") {
        const id = typeof args.id === "string" ? args.id.trim() : "";
        if (!id) throw new Error("Invalid Doc id");
        const doc = options.port.getDoc(id);
        if (!doc) throw new Error(`Doc not found: ${id}`);
        return textResult(doc);
      }
      throw new Error(`Unknown workspace Docs tool: ${name}`);
    },
  };
}
