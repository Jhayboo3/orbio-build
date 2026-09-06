import type { GuardAgent } from "./agent.js";
import { parseMicroUsd } from "./money.js";

export type PolicyReasonCode =
  | "AGENT_DISABLED"
  | "AGENT_PAUSED"
  | "MODEL_NOT_ALLOWED"
  | "REQUEST_LIMIT_EXCEEDED";

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; code: PolicyReasonCode; message: string };

export function evaluateStaticPolicy(
  agent: GuardAgent,
  request: { estimatedCostMicroUsd: string; model: string },
): PolicyDecision {
  if (agent.status === "disabled") {
    return deny("AGENT_DISABLED", "This agent is disabled.");
  }

  if (agent.status === "paused") {
    return deny("AGENT_PAUSED", "This agent is paused.");
  }

  if (!agent.allowedModels.some((pattern) => matchesModel(pattern, request.model))) {
    return deny(
      "MODEL_NOT_ALLOWED",
      `Model "${request.model}" is not allowed for this agent.`,
    );
  }

  if (
    agent.maxRequestMicroUsd !== null &&
    parseMicroUsd(request.estimatedCostMicroUsd) >
      parseMicroUsd(agent.maxRequestMicroUsd)
  ) {
    return deny(
      "REQUEST_LIMIT_EXCEEDED",
      "Estimated request cost exceeds the per-request limit.",
    );
  }

  return { allowed: true };
}

export function matchesModel(pattern: string, model: string): boolean {
  if (pattern === "*") {
    return true;
  }

  return pattern.endsWith("*")
    ? model.startsWith(pattern.slice(0, -1))
    : model === pattern;
}

function deny(code: PolicyReasonCode, message: string): PolicyDecision {
  return { allowed: false, code, message };
}
