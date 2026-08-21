/**
 * Narrow a run's capability grant so the agent is not given every eligible
 * tool schema. Selection is host-side: no sandbox, no tool loop.
 */

export type CapabilityGrantMode = "all" | "allowlist" | "bundles" | "model";

export type CapabilityGrantPolicy = {
  mode: CapabilityGrantMode;
  /** Tool names used by allowlist mode and as the model-mode fallback. */
  tools?: readonly string[];
  /** Named groups. Bundle ids are selectable names that expand to tools. */
  bundles?: Readonly<Record<string, readonly string[]>>;
  /** Bundle ids granted in bundles mode, and model fallback when `tools` is empty. */
  defaultBundles?: readonly string[];
};

export type GrantedToolSelection = {
  task: string;
  eligibleTools: readonly string[];
  bundles?: Readonly<Record<string, readonly string[]>>;
  descriptions?: Readonly<Record<string, string>>;
};

export type PickGrantedNames = (input: {
  task: string;
  names: readonly string[];
  listing: string;
}) => readonly string[] | Promise<readonly string[]>;

export type SelectGrantedTools = (
  input: GrantedToolSelection,
) => Promise<readonly string[]>;

const DEFAULT_POLICY: CapabilityGrantPolicy = { mode: "all" };

export function expandGrantedNames(
  names: readonly string[],
  bundles: Readonly<Record<string, readonly string[]>> = {},
): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    expanded.push(name);
  };
  for (const name of names) {
    const group = bundles[name];
    if (group) group.forEach(add);
    else add(name);
  }
  return expanded;
}

export function intersectGrantedTools(
  selected: readonly string[],
  eligible: readonly string[],
): string[] {
  const allowed = new Set(eligible);
  return selected.filter((name) => allowed.has(name));
}

export function candidateListing(input: GrantedToolSelection): {
  names: string[];
  listing: string;
} {
  const bundles = input.bundles ?? {};
  const names: string[] = [];
  const lines: string[] = [];
  for (const [id, tools] of Object.entries(bundles)) {
    names.push(id);
    lines.push(`${id} (bundle) → ${tools.join(", ")}`);
  }
  for (const tool of input.eligibleTools) {
    names.push(tool);
    const description = input.descriptions?.[tool];
    lines.push(description ? `${tool}: ${description}` : tool);
  }
  return { names, listing: lines.join("\n") };
}

function fallbackTools(
  policy: CapabilityGrantPolicy,
  eligible: readonly string[],
  bundles: Readonly<Record<string, readonly string[]>>,
): string[] {
  const names = policy.tools?.length
    ? policy.tools
    : policy.defaultBundles?.length
      ? policy.defaultBundles
      : eligible;
  const tools = intersectGrantedTools(expandGrantedNames(names, bundles), eligible);
  return tools.length ? tools : [...eligible];
}

export async function selectGrantedTools(
  policy: CapabilityGrantPolicy = DEFAULT_POLICY,
  input: GrantedToolSelection,
  options: { pick?: PickGrantedNames } = {},
): Promise<readonly string[]> {
  const eligible = input.eligibleTools;
  if (!eligible.length) return [];
  const bundles = { ...policy.bundles, ...input.bundles };
  const fallback = fallbackTools(policy, eligible, bundles);
  const mode = policy.mode ?? "all";

  if (mode === "all") return eligible;
  if (mode === "allowlist") return fallback;
  if (mode === "bundles") {
    const names = policy.defaultBundles?.length
      ? policy.defaultBundles
      : Object.keys(bundles);
    const tools = intersectGrantedTools(
      expandGrantedNames(names, bundles),
      eligible,
    );
    return tools.length ? tools : fallback;
  }

  const { names, listing } = candidateListing({ ...input, bundles });
  try {
    if (!options.pick) return fallback;
    const picked = await options.pick({
      task: input.task,
      names,
      listing,
    });
    const tools = intersectGrantedTools(
      expandGrantedNames(picked, bundles),
      eligible,
    );
    return tools.length ? tools : fallback;
  } catch {
    return fallback;
  }
}

export function createGrantedToolSelector(
  policy: () => CapabilityGrantPolicy,
  options: { pick?: PickGrantedNames } = {},
): SelectGrantedTools {
  return (input) => selectGrantedTools(policy(), input, options);
}
