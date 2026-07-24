import { createSoftwareEngineerRunner } from "../composition/software-engineer";

const required = (name: string): string => {
  const value = Bun.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const prompt = Bun.argv.slice(2).join(" ").trim();
if (!prompt) throw new Error('Usage: bun run agent:software-engineer -- "task"');

const runner = createSoftwareEngineerRunner({
  model: {
    baseUrl: required("LLM_BASE_URL"),
    apiKey: required("LLM_API_KEY"),
    model: required("LLM_MODEL"),
  },
});

const result = await runner.run({
  sandbox: { image: Bun.env.SWEAT_AGENT_IMAGE ?? "sweat-agent:latest" },
  prompt,
});

process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.exitCode;
