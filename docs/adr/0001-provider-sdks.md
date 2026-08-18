# Use provider-maintained SDKs

Status: accepted

Provider integrations are deployment-side adapters. They must use the
provider-maintained SDK when one exists instead of recreating its HTTP client,
authentication, endpoint serialization, and response types.

For GitHub, Sweat uses Octokit. The deployment authenticates Octokit with a
repository-scoped personal access token (`SWEAT_GITHUB_TOKEN`) and passes it
to the checkout provisioner or MCP gateway. It does not read credentials from
the GitHub CLI or the host keychain. The agent container receives neither the
SDK credentials nor an authenticated GitHub client.

The adapter still validates untyped MCP arguments and enforces the run's
repository grant. It does not reimplement GitHub REST calls. A direct HTTP
call is acceptable only where the provider SDK has no supported API.
