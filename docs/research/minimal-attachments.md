# Minimal attachments research

Date: 2026-07-31

Question: what is the smallest useful way for Sweat to support pasted images and
attached files without creating a large backend/storage subsystem?

This is research only. No application code was changed.

## Executive finding

The smallest coherent feature is not a general file library, RAG pipeline, or
provider-specific upload system. It is:

1. A native file picker plus paste/drop handling in the existing composer.
2. One bounded multipart message request containing text and zero or more files.
3. One attachment metadata record per file, tied to the message, with the bytes
   kept in the existing self-hosted SQLite database for the first version.
4. An authenticated attachment-download route.
5. For agent runs, copy the attachment bytes into the existing `/work` staging
   directory and expose the filenames in the task context.

That supports durable room history, download/share behavior, and arbitrary file
types without adding object storage, a file catalog, background processing, or
vector search. It also fits the current self-hosted deployment, which already
has one configurable SQLite database path.

The important limitation is images. Files staged in `/work` are useful to a
shell-capable software agent, but that does not automatically make an image
visible to the model. Native multimodal model input is a separate capability
and should be added only when the product decides which model/provider contract
it supports.

## What exists in Sweat today

The current flow is intentionally text-only:

- [`message-composer.tsx`](../../project/gui/src/features/rooms/message-composer.tsx)
  uses TipTap and emits `editor.getText()`.
- [`use-rooms.ts`](../../project/gui/src/features/rooms/use-rooms.ts) sends JSON
  with `{ text }` to the room message endpoint.
- [`coordinator.ts`](../../project/gui/src/server/coordinator.ts) parses one
  text body, persists one message, and derives an agent task from that text.
- [`room-store.ts`](../../project/gui/src/server/room-store.ts) and the room
  migration store only a `text` column for messages.
- [`openai-agents.ts`](../../project/runtime/openai-agents.ts) currently calls
  the agent runner with a string task. The OpenAI Agents SDK can accept
  structured input items, but Sweat's runtime boundary does not expose them.
- Runs already support prepared workspaces mounted at `/work`; repository
  inputs use this mechanism in [`runs/index.ts`](../../project/runs/index.ts).

This means the UI event is easy; the durable attachment and agent-input
boundary are the real design decisions.

## Prior art

### Aider: keep files local to the agent

Aider is the smallest relevant model: files are added to the local chat session
with `/add`, and images can be added with `/add <image-filename>` or pasted
from the clipboard with `/paste`. Its documented workflow is based on local
filenames and the agent's working directory, not a server-side attachment
library.

- [Aider usage: adding files](https://aider.chat/docs/usage.html)
- [Aider images and paste](https://aider.chat/docs/usage/images-urls.html)

Lesson for Sweat: if attachments are mainly agent inputs, staging files into
the existing disposable workspace is a very small and provider-neutral model.
The tradeoff is that the attachment is not automatically a durable, shared
room artifact unless Sweat stores it separately.

### Zulip: upload first, reference from the message

Zulip exposes a dedicated upload endpoint. It returns a URL and filename; the
client then sends a normal message containing a link to that upload. Zulip also
tracks which messages reference each upload and deletes unreferenced uploads
after a retention period.

- [Zulip upload-file API](https://zulip.com/api/upload-file)
- [Zulip attachment metadata and references](https://chat.zulip.com/api/get-attachments)
- [Zulip attachment deletion](https://zulip.com/api/remove-attachment)

Lesson for Sweat: separating upload from message is the established design when
uploads need progress, retries, reuse, or large-file handling. It is more
backend lifecycle than the first Sweat slice needs.

### Open WebUI: real file storage plus processing

Open WebUI's current implementation has a file endpoint, storage providers,
file metadata, optional extraction/processing, chat-file associations, and
lazy attachment loading. Its changelog explicitly describes converting
user-uploaded base64 images into actual file storage to avoid large inline
base64 strings in chat history. It also supports a browser-only path for
temporary chats, where extraction can happen without sending files to the
backend.

- [Open WebUI file upload source](https://github.com/open-webui/open-webui/blob/main/backend/open_webui/routers/files.py)
- [Open WebUI file/attachment changes](https://github.com/open-webui/open-webui/blob/main/CHANGELOG.md)

Lesson for Sweat: mature attachment systems become a subsystem quickly. Do not
copy their processing, vector database, provider storage, or file-library
features unless those are explicit product requirements.

### LobeHub: upload/drag-drop is coupled to model and knowledge features

LobeHub documents image upload and drag/drop as part of a broader file-upload
and knowledge-base feature set. This is useful evidence that the visible UX is
small, but the underlying behavior becomes provider- and knowledge-system
dependent once arbitrary documents are promised to the model.

- [LobeHub repository description](https://github.com/lobehub/lobehub)

Lesson for Sweat: describe the first feature narrowly as “attach a file to a
message and make it available to the run,” not “every model understands every
attachment.”

## UI implementation pattern

The browser already provides nearly all selection mechanics:

- `<input type="file">` selects local files and supports `multiple`.
- `accept` can guide the picker, but MDN explicitly says it is not server-side
  validation.
- TipTap's FileHandler extension handles paste and drop events, but explicitly
  does not upload files; the application owns the upload callback.

Sources:

- [MDN: file input](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)
- [MDN: accept attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/accept)
- [Tiptap FileHandler](https://tiptap.dev/docs/editor/extensions/functionality/filehandler)

For this composer, the minimal UX is one attachment button backed by a hidden
native input, plus paste/drop handling. Keep selected files as composer state,
show filename/size chips, allow removal, and allow a message containing only
attachments. Do not turn attachments into TipTap document nodes unless inline
rich-text placement is required; message-level attachments are simpler and
avoid storing editor HTML/JSON.

## Transport and storage choices

| Choice | What it buys | Cost | Fit for first Sweat slice |
| --- | --- | --- | --- |
| Base64 inside message JSON/text | Almost no new endpoint | Payload bloat, websocket/history bloat, awkward limits, unsafe to treat as durable storage | No |
| SQLite BLOB plus attachment metadata | One existing durable store, simple backup, atomic message relationship | Database/WAL grows with bytes; must cap request and attachment sizes | Best for small bounded files |
| Local files beside SQLite plus metadata | Keeps database smaller | New backup path, cleanup, orphan handling, path security | Later if volume proves it necessary |
| S3/MinIO/provider object storage | Large files, independent scaling, resumable uploads | New operator configuration and lifecycle; no longer a compact default deployment | No |
| Provider file IDs/data URLs only | Fastest route to one provider's model | Provider coupling, expiry/deletion semantics, no self-hosted room artifact, weak support for alternate base URLs | No |

SQLite BLOB is a deliberate MVP tradeoff, not a universal storage answer. It is
reasonable only with hard limits such as a small number of files per message
and a small total byte limit. If users begin sharing large videos, archives, or
many documents, move bytes to a filesystem/object store without changing the
message-level metadata contract.

Do not put raw base64 in `room_message.text`. Open WebUI's experience is a
useful warning: inline image data makes chat history and message payloads
larger, which is why it moved uploaded images into file storage.

## Agent-input choices

There are three distinct meanings of “the agent can use the attachment”:

1. **Downloadable room attachment.** The agent is not involved. The room shows
   the file and authorized members can fetch it.
2. **Workspace input.** The server copies the file into the run's existing
   `/work` directory. The agent can inspect text/code files with its shell and
   tools. This is the smallest provider-neutral extension.
3. **Native multimodal prompt.** The runtime passes an `input_image` or
   `input_file` item to a model API. This gives a vision-capable model direct
   access to image/PDF content, but it makes model capability and provider
   compatibility part of the product contract.

The current OpenAI Agents SDK supports lists of input items and documents image
and file input types. OpenAI's Responses API supports image URLs/data URLs and
file data, file IDs, or file URLs. Sweat currently passes only a string task,
so native multimodal input is not “free” even though the dependency supports
the underlying shape.

- [OpenAI Agents SDK: running agents](https://openai.github.io/openai-agents-js/guides/running-agents/)
- [OpenAI Agents SDK: user input items](https://openai.github.io/openai-agents-js/openai/agents-core/functions/user/)
- [OpenAI Responses input image/file types](https://platform.openai.com/docs/api-reference/responses-streaming/response/custom_tool_call_input/done)

Recommendation: make workspace input the first agent behavior and call native
multimodal input a separate follow-up. Otherwise “file attachment” silently
means different things for different configured models, especially since Sweat
advertises an OpenAI-compatible base URL rather than one fixed provider.

## Smallest sensible scope

Include:

- images and ordinary user-selected files;
- paste, picker, and drop;
- one message-level attachment list;
- hard count/byte limits;
- server-side content/type checks;
- opaque attachment IDs and original filename metadata;
- room-authorized download/preview;
- staging into `/work` for a run;
- attachment metadata in realtime/history payloads, not attachment bytes.

Defer:

- full file library and reuse across messages;
- resumable/chunked uploads;
- S3/MinIO configuration;
- PDF/DOCX extraction, OCR, transcription, or embeddings;
- automatic image compression/transcoding;
- virus scanning beyond whatever deployment already provides;
- provider-specific upload/file IDs;
- model capability negotiation;
- inline images inside rich text.

Required trust-boundary checks are not optional: enforce size/count/type on the
server, generate storage names rather than using client filenames as paths,
authorize every download by room membership, and clean up bytes if message
creation fails. The `accept` picker hint cannot replace these checks.

## Bottom line

For Sweat, the compact path is an attachment-bearing message backed by bounded
SQLite storage, with files copied into the existing run workspace. That is the
fewest new concepts that still gives users durable shared attachments and gives
agents useful file inputs.

The thing to avoid is the tempting half-feature: a file picker that uploads
base64 into the message or displays an image locally but never gives the server
or run a durable, authorized representation.
