# Use provider-maintained SDKs

Status: accepted

Provider integrations are deployment-side adapters. They must use the
provider-maintained SDK when one exists instead of recreating its HTTP client,
authentication, endpoint serialization, and response types.

For GitHub, Sweat uses Octokit. The deployment creates an installation-scoped
Octokit client from its GitHub App credentials and passes it to the checkout
provisioner or MCP gateway. The agent container receives neither the SDK
credentials nor an authenticated GitHub client.

The adapter still validates untyped MCP arguments and enforces the run's
repository grant. It does not reimplement GitHub REST calls. A direct HTTP
call is acceptable only where the provider SDK has no supported API.
