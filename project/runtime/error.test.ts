import { expect, test } from "bun:test";
import { describeError } from "./error";

test("names the reason the OpenAI SDK hides behind its message", () => {
  // The exact shape of an APIConnectionError: fixed message, real cause.
  const connection = new Error("Connection error.", {
    cause: new Error("getaddrinfo EAI_AGAIN mlflow.internal"),
  });
  expect(describeError(connection)).toBe(
    "Connection error.: getaddrinfo EAI_AGAIN mlflow.internal",
  );
});

test("keeps a code-only cause and survives a cycle", () => {
  expect(
    describeError(new Error("fetch failed", { cause: "ECONNREFUSED" })),
  ).toBe("fetch failed: ECONNREFUSED");
  const loop = new Error("outer");
  loop.cause = loop;
  expect(describeError(loop)).toBe("outer");
  expect(describeError("plain")).toBe("plain");
});
