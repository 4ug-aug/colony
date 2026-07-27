import type { McpUpstream } from "./gateway";

export interface WorkspaceAuthor { kind: "agent"; id: string; name: string; image?: string }
export interface WorkspaceMessage {
  author: { kind: "user" | "agent"; id: string; name: string; image?: string };
  text: string;
  createdAt: number;
}
export interface WorkspaceRoomPort {
  listMessages(roomId: string): readonly WorkspaceMessage[];
  postMessage(input: { roomId: string; author: WorkspaceAuthor; text: string }): void;
}

export function createWorkspaceMcpUpstream(options: {
  port: WorkspaceRoomPort;
  roomId: string;
  agent: { id: string; name: string; image?: string };
}): McpUpstream {
  return {
    async listTools() {
      return [
        {
          name: "workspace.read_messages",
          description: "Read recent messages in the current room.",
          inputSchema: { type: "object", properties: { limit: { type: "number" } } },
        },
        {
          name: "workspace.post_message",
          description: "Post a message from you into the current room.",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        },
      ];
    },

    async callTool(name, args) {
      if (name === "workspace.read_messages") {
        const limit = typeof args.limit === "number" && args.limit > 0 ? args.limit : 50;
        return { messages: options.port.listMessages(options.roomId).slice(-limit) };
      }
      if (name === "workspace.post_message") {
        const text = typeof args.text === "string" ? args.text.trim() : "";
        if (!text) throw new Error("A non-empty text is required");
        options.port.postMessage({
          roomId: options.roomId,
          author: { kind: "agent", ...options.agent },
          text,
        });
        return { posted: true };
      }
      throw new Error(`Unknown workspace tool: ${name}`);
    },
  };
}
