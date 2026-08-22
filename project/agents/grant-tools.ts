/**
 * Narrow a run's capability grant so the agent is not given every eligible
 * tool schema. Selection is host-side: no sandbox, no tool loop.
 */

export type CapabilityGrantMode = "all" | "allowlist" | "model";

export type CapabilityGrantPolicy = {
  mode: CapabilityGrantMode;
  /** Tool or bundle names used by allowlist mode and as the model-mode fallback. */
  tools?: readonly string[];
  /** Named groups. Bundle ids are selectable names that expand to tools. */
  bundles?: Readonly<Record<string, readonly string[]>>;
};

export type GrantedToolSelection = {
  task: string;
  eligibleTools: readonly string[];
  bundles?: Readonly<Record<string, readonly string[]>>;
  descriptions?: Readonly<Record<string, string>>;
};

export type GrantSelectionReason = "all" | "narrowed" | "fallback" | "picker-failed";

export type GrantSelection = {
  tools: readonly string[];
  reason: GrantSelectionReason;
};

export type PickGrantedNames = (input: {
  task: string;
  names: readonly string[];
  listing: string;
}) => readonly string[] | Promise<readonly string[]>;

export type SelectGrantedTools = (
  input: GrantedToolSelection,
) => Promise<GrantSelection>;

const DEFAULT_POLICY: CapabilityGrantPolicy = { mode: "all" };

export function expandGrantedNames(
  names: readonly string[],
  bundles: Readonly<Record<string, readonly string[]>> = {},
): string[] {
  return [...new Set(names.flatMap((name) => bundles[name] ?? [name]))];
}

export function intersectGrantedTools(
  selected: readonly string[],
  eligible: readonly string[],
): string[] {
  const allowed = new Set(eligible);
  return selected.filter((name) => allowed.has(name));
}

function candidateListing(input: GrantedToolSelection): {
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
  if (!policy.tools?.length) return [...eligible];
  const tools = intersectGrantedTools(
    expandGrantedNames(policy.tools, bundles),
    eligible,
  );
  return tools.length ? tools : [...eligible];
}

export async function selectGrantedTools(
  policy: CapabilityGrantPolicy = DEFAULT_POLICY,
  input: GrantedToolSelection,
  options: { pick?: PickGrantedNames } = {},
): Promise<GrantSelection> {
  const eligible = input.eligibleTools;
  if (!eligible.length) return { tools: [], reason: "all" };
  if (policy.mode === "all") return { tools: eligible, reason: "all" };

  const bundles = { ...policy.bundles, ...input.bundles };

  if (policy.mode === "allowlist") {
    const tools = intersectGrantedTools(
      expandGrantedNames(policy.tools ?? [], bundles),
      eligible,
    );
    return tools.length
      ? { tools, reason: "narrowed" }
      : { tools: eligible, reason: "fallback" };
  }

  const fallback = fallbackTools(policy, eligible, bundles);
  const { names, listing } = candidateListing({ ...input, bundles });
  try {
    if (!options.pick) throw new Error("model mode requires pick");
    const picked = await options.pick({
      task: input.task,
      names,
      listing,
    });
    const tools = intersectGrantedTools(
      expandGrantedNames(picked, bundles),
      eligible,
    );
    return tools.length
      ? { tools, reason: "narrowed" }
      : { tools: fallback, reason: "fallback" };
  } catch (error) {
    console.error("Tool picker failed", error);
    return { tools: fallback, reason: "picker-failed" };
  }
}
