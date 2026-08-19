/**
 * The whole message, cause included.
 *
 * `APIConnectionError.message` from the OpenAI SDK is the fixed string
 * "Connection error." — the reason (`getaddrinfo EAI_AGAIN`, `self signed
 * certificate`, `ECONNREFUSED`) is only in `cause`. Reporting the message alone
 * turns every network fault a sandbox can have into the same two useless words.
 */
export function describeError(error: unknown, depth = 4): string {
  if (!(error instanceof Error)) return String(error);
  const seen = new Set<unknown>();
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && parts.length < depth) {
    if (seen.has(current)) break;
    seen.add(current);
    const message = current.message.trim() || current.name;
    if (!parts.includes(message)) parts.push(message);
    current = current.cause;
  }
  // A non-Error cause still carries the reason: Node puts a code string there.
  if (current !== undefined && !(current instanceof Error) && parts.length) {
    const tail = String(current).trim();
    if (tail && !parts.includes(tail)) parts.push(tail);
  }
  return parts.join(": ");
}
