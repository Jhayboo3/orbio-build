import { describe, expect, it } from "vitest";
import {
  evaluateCloudPolicy,
  extractCloudCostMicroUsd,
  extractCloudStreamCostMicroUsd,
  formatCloudUsd,
  matchesCloudModel,
  type CloudAgent,
} from "../../src/cloudflare/core.js";

const agent: CloudAgent = {
  allowedModels: ["openai/gpt-*"],
  createdAt: "2026-09-07T00:00:00.000Z",
  dailyBudgetMicroUsd: "100000",
  id: "agent-1",
  maxRequestMicroUsd: "50000",
  name: "Cloud agent",
  project: null,
  status: "active",
  tokenHash: "hash",
  updatedAt: "2026-09-07T00:00:00.000Z",
};

describe("Cloudflare Guard core", () => {
  it("matches exact and suffix-wildcard models", () => {
    expect(matchesCloudModel("openai/gpt-*", "openai/gpt-4o-mini")).toBe(true);
    expect(matchesCloudModel("anthropic/claude", "openai/gpt-4o-mini")).toBe(false);
  });

  it("fails closed for status, model, and request limits", () => {
    expect(evaluateCloudPolicy({ ...agent, status: "disabled" }, { estimatedCostMicroUsd: "1", model: "openai/gpt-4o-mini" })).toMatchObject({ code: "AGENT_DISABLED" });
    expect(evaluateCloudPolicy(agent, { estimatedCostMicroUsd: "1", model: "anthropic/claude" })).toMatchObject({ code: "MODEL_NOT_ALLOWED" });
    expect(evaluateCloudPolicy(agent, { estimatedCostMicroUsd: "50001", model: "openai/gpt-4o-mini" })).toMatchObject({ code: "REQUEST_LIMIT_EXCEEDED" });
  });

  it("extracts buffered and streamed provider costs", () => {
    expect(extractCloudCostMicroUsd('{"usage":{"cost":0.000007}}')).toBe("7");
    expect(extractCloudStreamCostMicroUsd('data: {"response":{"usage":{"cost":0.12}}}\n\ndata: [DONE]\n')).toBe("120000");
  });

  it("formats integer micro-dollars without floating point loss", () => {
    expect(formatCloudUsd("120000")).toBe("0.12");
    expect(formatCloudUsd("7000001")).toBe("7.000001");
  });
});
