# Apple Container SDK for Bun

A dependency-free Bun wrapper around Apple's `container` CLI.

```ts
import { createAppleContainerClient } from "@sweat/apple-container";

const container = createAppleContainerClient();

await container.system.start();

await container.containers.run("nginx:alpine", {
  name: "web",
  detach: true,
  remove: true,
  publish: ["127.0.0.1:8080:80"],
});

const running = await container.containers.list();
await container.containers.stop(["web"]);
```

The SDK is composed from small protocols. Replace the process boundary in
tests or add another runtime adapter without changing the operations:

```ts
import {
  createAppleContainerClient,
  type CommandRunner,
} from "@sweat/apple-container";

const runner: CommandRunner = {
  async run(args, options) {
    // Remote execution, tracing, policy checks, or a test fake.
    return { args, exitCode: 0, stdout: "[]", stderr: "" };
  },
};

const container = createAppleContainerClient(runner);
```

Use `container.raw([...])` for CLI features that do not yet have a typed
operation.
