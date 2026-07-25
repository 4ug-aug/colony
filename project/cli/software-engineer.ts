import { createSoftwareEngineerExecutor } from "../composition/software-engineer";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const task = Bun.argv.slice(2).join(" ").trim();
if (!task) throw new Error('Usage: bun run agent:software-engineer -- "task"');

const executor = createSoftwareEngineerExecutor({
  image: Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest",
  model: {
    baseUrl: required("LLM_BASE_URL"),
    apiKey: required("LLM_API_KEY"),
    model: required("LLM_MODEL"),
  },
});

const id = executor.startRun({
  agentDefinitionId: "software-engineer",
  task,
});

let result;
while ((result = executor.getRun(id)) && !["succeeded", "failed", "cancelled"].includes(result.state)) {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
if (!result) throw new Error(`Run disappeared: ${id}`);

process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.state === "succeeded" ? 0 : 1;
