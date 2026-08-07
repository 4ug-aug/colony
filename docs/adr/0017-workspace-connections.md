# Workspace Connections as source of truth

Status: accepted

External provider setups for registered Connection kinds (Asana, Outline,
Grafana first) live in the workspace database, encrypted with the existing
secret-box, and are edited in Workspace → Connections. A code registry defines
each Connection kind; the UI, API, and storage are generic over that registry.
Agents receive a Connection's tools only when the Connection is Configured and
has a Connection link to that agent definition; clearing credentials also
clears links. Env vars are not a fallback. Rejected: hashing secrets (they must
be presented outbound), user-defined MCP catalogs, soft-disable without
clearing links, and keeping role-hardcoded requests for these Connection
capabilities.
