import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

export type AgentStatus = "active" | "paused" | "disabled";

export interface GuardAgent {
  allowedModels: string[];
  createdAt: string;
  dailyBudgetMicroUsd: string;
  id: string;
  maxRequestMicroUsd: string | null;
  name: string;
  project: string | null;
  status: AgentStatus;
  tokenHash: string;
  updatedAt: string;
}

export interface CreatedGuardAgent {
  agent: GuardAgent;
  token: string;
}

export function createGuardAgent(input: {
  allowedModels: string[];
  dailyBudgetMicroUsd: string;
  maxRequestMicroUsd?: string | null;
  name: string;
  now?: Date;
  project?: string | null;
}): CreatedGuardAgent {
  validateModelPatterns(input.allowedModels);
  const now = (input.now ?? new Date()).toISOString();
  const token = createAgentToken();

  return {
    agent: {
      allowedModels: [...new Set(input.allowedModels)],
      createdAt: now,
      dailyBudgetMicroUsd: input.dailyBudgetMicroUsd,
      id: randomUUID(),
      maxRequestMicroUsd: input.maxRequestMicroUsd ?? null,
      name: input.name.trim(),
      project: input.project?.trim() || null,
      status: "active",
      tokenHash: hashAgentToken(token),
      updatedAt: now,
    },
    token,
  };
}

export function createAgentToken(): string {
  return `og_agent_${randomBytes(32).toString("base64url")}`;
}

export function hashAgentToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyAgentToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashAgentToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function validateModelPatterns(patterns: string[]): void {
  if (patterns.length === 0) {
    throw new Error("At least one allowed model pattern is required.");
  }

  for (const pattern of patterns) {
    if (!pattern || (pattern.includes("*") && pattern !== "*" && !pattern.endsWith("*"))) {
      throw new Error(
        `Invalid model pattern "${pattern}". Only exact values, "*", or suffix wildcards are supported.`,
      );
    }

    if (pattern.slice(0, -1).includes("*")) {
      throw new Error(`Invalid model pattern "${pattern}".`);
    }
  }
}
