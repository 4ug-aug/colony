# Workspace Issue tools over MCP

Status: accepted

Agents read and write Sweat Issues through first-party **Issue tools** granted
as the `workspace.issues` MCP capability (same session path as
`workspace.room`), not through Linear tools or a cross-provider task
abstraction. V1 grants are **workspace-wide**. V1 tools are list, get, create,
update, and assign (set owner to an Account or Agent definition) so an agent
can hand Issues to other agents or humans without a separate delegation type.
Rejected: single-Issue grants as the default; folding assign only into a
generic update with no dedicated tool (models need an obvious assign verb);
removing the MCP grant pattern for a side-channel tool API. Linear remains
optional/legacy external wiring, not the default role path.
