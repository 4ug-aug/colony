# Workspace LLM configuration

Each Sweat server has one workspace-wide model configuration. It is used when
new room and schedule runs start; each run retains the provider and model it
started with.

Only a workspace administrator can view or change it in **Workspace → LLM
provider**.

## Fields

| Field | Meaning |
| --- | --- |
| Provider | **OpenAI** for the hosted OpenAI API, or **Custom / OpenAI-compatible** for another compatible server. |
| Base URL | The provider's OpenAI-compatible `/v1` endpoint. |
| Model | The exact provider model identifier. |
| API key | Required when first saving a configuration. Leave it blank on later saves to keep the current key. |

The server stores the API key encrypted and never returns it to clients.
Saving validates the configuration fields; the provider connection is used when
the next run starts.

## Ollama

Ollama exposes an OpenAI-compatible endpoint locally. Start Ollama and pull a
model, for example:

```sh
ollama pull qwen3:8b
ollama list
```

Then configure Sweat as:

| Field | Value |
| --- | --- |
| Provider | Custom / OpenAI-compatible |
| Base URL | `http://localhost:11434/v1` |
| Model | The exact name reported by `ollama list`, for example `qwen3:8b` |
| API key | `ollama` |

Ollama ignores the API key, but Sweat requires a non-empty value when first
saving a provider.

## Container networking

Agents run in disposable sandboxes. A model URL of `localhost`, `127.0.0.1`,
or `[::1]` is automatically rewritten to whatever name that sandbox reaches the
host by -- `host.container.internal` in a container, the default route it
reports in a microVM -- so the workspace setting can keep the normal local
Ollama URL.

The Apple Container host alias must be available after each macOS restart; see
the [container setup](../project/README.md#troubleshooting). If Ollama runs on
another machine, use that machine's reachable HTTP URL instead of `localhost`.

## An internal model gateway

A gateway on an internal zone, such as `https://mlflow.example.local/...`, needs
two things a sandbox does not have by default. Set both in `.env.local` and
restart the coordinator:

| Variable | Why |
| --- | --- |
| `SWEAT_SANDBOX_DNS` | A sandbox resolves through 8.8.8.8 and 1.1.1.1, so the name is NXDOMAIN. Name a resolver that knows the zone -- not a systemd-resolved stub (`127.0.0.53`), which is the sandbox's own loopback; take the upstream `resolvectl status` reports. |
| `SWEAT_AGENT_CA_CERT` | Such a gateway serves a private CA's certificate, and often sends the leaf alone. Bun trusts only public roots, so the run fails on `unable to verify the first certificate`. |

Without the first, every run fails with the OpenAI SDK's `Connection error.`
and, underneath it, Bun's `Unable to connect. Is the computer able to access the
url?` -- which is what a failed lookup looks like, not a refused connection.

## Cursor agent runtime

Cursor is **not** configured here. Use **Workspace → Cursor agent runtime** for
the Cursor API key and model catalog used by `@software-engineer`. The
OpenAI-compatible settings on this page power `@antboy`. See
[docs/research/cursor-provider.md](research/cursor-provider.md).
