# Workspace Bulletin board (people-only freeform canvas)

Status: accepted

The workspace has one shared Bulletin board: freeform markdown Bulletins with
normalized positions on a fixed viewport canvas. Any member can create, edit,
move, and delete any Bulletin. Positions sync to other clients via the existing
workspace WebSocket on drop only (not during drag). Agents have no Bulletin
port or MCP tools — Issues already own agent-assignable work. Rejected: sortable
list/grid as the primary model, pan/zoom, live-drag presence events, multiple
boards, Room-scoped boards, and agent CRUD in v1.
