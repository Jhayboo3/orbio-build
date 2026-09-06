import { describe, expect, it } from "vitest";
import {
  createGuardAgent,
  verifyAgentToken,
} from "../../src/domain/agent.js";
import { evaluateStaticPolicy } from "../../src/domain/policy.js";

describe("agent credentials and policy", () => {
  it("stores only a token hash and verifies the one-time token", () => {
    const created = createGuardAgent({
      allowedModels: ["openai/*"],
      dailyBudgetMicroUsd: "10000000",
      name: "Build agent",
    });

    expect(created.agent.tokenHash).not.toContain(created.token);
    expect(verifyAgentToken(created.token, created.agent.tokenHash)).toBe(true);
    expect(verifyAgentToken("og_agent_invalid", created.agent.tokenHash)).toBe(false);
  });

  it("enforces status, model, and request limits", () => {
    const { agent } = createGuardAgent({
      allowedModels: ["openai/gpt-*", "anthropic/claude-sonnet"],
      dailyBudgetMicroUsd: "10000000",
      maxRequestMicroUsd: "1000000",
      name: "Policy agent",
    });

    expect(
      evaluateStaticPolicy(agent, {
        model: "openai/gpt-6",
        estimatedCostMicroUsd: "500000",
      }),
    ).toEqual({ allowed: true });
    expect(
      evaluateStaticPolicy(agent, {
        model: "google/gemini",
        estimatedCostMicroUsd: "500000",
      }),
    ).toMatchObject({ allowed: false, code: "MODEL_NOT_ALLOWED" });
    expect(
      evaluateStaticPolicy(agent, {
        model: "anthropic/claude-sonnet",
        estimatedCostMicroUsd: "1000001",
      }),
    ).toMatchObject({ allowed: false, code: "REQUEST_LIMIT_EXCEEDED" });

    agent.status = "disabled";
    expect(
      evaluateStaticPolicy(agent, {
        model: "openai/gpt-6",
        estimatedCostMicroUsd: "1",
      }),
    ).toMatchObject({ allowed: false, code: "AGENT_DISABLED" });
  });
});
