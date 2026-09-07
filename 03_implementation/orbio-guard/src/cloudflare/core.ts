export type CloudAgentStatus = "active" | "paused" | "disabled";

export interface CloudAgent {
  allowedModels: string[];
  archivedAt?: string | null;
  createdAt: string;
  dailyBudgetMicroUsd: string;
  id: string;
  maxRequestMicroUsd: string | null;
  name: string;
  project: string | null;
  status: CloudAgentStatus;
  tokenHash: string;
  updatedAt: string;
}

export function activeCloudAgents(agents: CloudAgent[]): CloudAgent[] {
  return agents.filter((agent) => !agent.archivedAt);
}

export function latestCloudKeyUse(
  events: Array<{ timestamp: string; type: string }>,
): string | null {
  return events.find((event) => event.type === "SPEND_CONFIRMED")?.timestamp ?? null;
}

export function matchesCloudModel(pattern: string, model: string): boolean {
  if (pattern === "*") return true;
  return pattern.endsWith("*")
    ? model.startsWith(pattern.slice(0, -1))
    : model === pattern;
}

export function validateCloudModelPatterns(patterns: string[]): void {
  if (patterns.length === 0) {
    throw new Error("At least one allowed model pattern is required.");
  }
  for (const pattern of patterns) {
    if (!pattern || (pattern.includes("*") && pattern !== "*" && !pattern.endsWith("*"))) {
      throw new Error(`Invalid model pattern "${pattern}".`);
    }
    if (pattern.slice(0, -1).includes("*")) {
      throw new Error(`Invalid model pattern "${pattern}".`);
    }
  }
}

export function evaluateCloudPolicy(
  agent: CloudAgent,
  input: { estimatedCostMicroUsd: string; model: string },
): { allowed: true } | { allowed: false; code: string; message: string } {
  if (agent.status === "disabled") {
    return deny("AGENT_DISABLED", "This agent is disabled.");
  }
  if (agent.status === "paused") {
    return deny("AGENT_PAUSED", "This agent is paused.");
  }
  if (!agent.allowedModels.some((pattern) => matchesCloudModel(pattern, input.model))) {
    return deny("MODEL_NOT_ALLOWED", `Model "${input.model}" is not allowed for this agent.`);
  }
  if (
    agent.maxRequestMicroUsd !== null &&
    BigInt(input.estimatedCostMicroUsd) > BigInt(agent.maxRequestMicroUsd)
  ) {
    return deny("REQUEST_LIMIT_EXCEEDED", "Estimated request cost exceeds the per-request limit.");
  }
  return { allowed: true };
}

export function extractCloudCostMicroUsd(body: string): string | undefined {
  try {
    return findCost(JSON.parse(body));
  } catch {
    return undefined;
  }
}

export function extractCloudStreamCostMicroUsd(body: string): string | undefined {
  let latest: string | undefined;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const value = line.slice(5).trim();
    if (!value || value === "[DONE]") continue;
    try {
      latest = findCost(JSON.parse(value)) ?? latest;
    } catch {
      continue;
    }
  }
  return latest;
}

export function formatCloudUsd(microUsd: string): string {
  const value = BigInt(microUsd);
  const whole = value / 1_000_000n;
  const fraction = (value % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function findCost(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const cost = findCost(item);
      if (cost !== undefined) return cost;
    }
    return undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const object = value as Record<string, unknown>;
  if (object.usage && typeof object.usage === "object") {
    const cost = (object.usage as Record<string, unknown>).cost;
    if (typeof cost === "number" && Number.isFinite(cost) && cost >= 0) {
      return Math.round(cost * 1_000_000).toString();
    }
  }
  for (const nested of Object.values(object)) {
    const cost = findCost(nested);
    if (cost !== undefined) return cost;
  }
  return undefined;
}

function deny(code: string, message: string) {
  return { allowed: false as const, code, message };
}
