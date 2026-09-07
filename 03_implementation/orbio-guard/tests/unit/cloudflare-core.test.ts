import { describe, expect, it } from "vitest";
import {
  activeCloudAgents,
  chatResponseToResponsesSse,
  evaluateCloudPolicy,
  extractCloudCostMicroUsd,
  extractCloudStreamCostMicroUsd,
  formatCloudUsd,
  latestCloudKeyUse,
  matchesCloudModel,
  orbioModelId,
  responsesToChatRequest,
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

  it("excludes archived agents without deleting their records", () => {
    expect(activeCloudAgents([agent, { ...agent, id: "archived", archivedAt: "2026-09-07T01:00:00.000Z" }])).toEqual([agent]);
  });

  it("derives key use from the latest confirmed spend", () => {
    expect(latestCloudKeyUse([
      { timestamp: "2026-09-07T02:00:00.000Z", type: "REQUEST_ALLOWED" },
      { timestamp: "2026-09-07T01:00:00.000Z", type: "SPEND_CONFIRMED" },
    ])).toBe("2026-09-07T01:00:00.000Z");
  });

  it("converts Codex Responses messages and function tools to Chat Completions", () => {
    expect(responsesToChatRequest({
      model: "openai/gpt-4o-mini",
      instructions: "Be concise.",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] },
        { type: "function_call_output", call_id: "call-1", output: "done" },
      ],
      tools: [{ type: "function", name: "read_file", description: "Read", parameters: { type: "object" }, strict: true }],
    })).toEqual({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "developer", content: "Be concise." },
        { role: "user", content: "Hello" },
        { role: "tool", tool_call_id: "call-1", content: "done" },
      ],
      stream: false,
      tools: [{ type: "function", function: { name: "read_file", description: "Read", parameters: { type: "object" }, strict: true } }],
    });
  });

  it("maps native Codex slugs to provider-qualified Orbio IDs", () => {
    expect(orbioModelId("gpt-5.6-sol")).toBe("openai/gpt-5.6-sol");
    expect(orbioModelId("anthropic/claude-sonnet-5")).toBe("anthropic/claude-sonnet-5");
  });

  it("converts assistant text and usage to Responses SSE", () => {
    const stream = chatResponseToResponsesSse({
      id: "gen-1",
      created: 1_788_771_926,
      model: "openai/gpt-4o-mini",
      choices: [{ message: { role: "assistant", content: "Connected" } }],
      usage: { prompt_tokens: 11, completion_tokens: 2, total_tokens: 13, cost: 0.00000285 },
    });
    expect(stream).toContain("event: response.output_text.delta");
    expect(stream).toContain('"delta":"Connected"');
    expect(stream).toContain('"cost":0.00000285');
    expect(stream).toContain("event: response.completed");
  });

  it("converts Chat Completions tool calls to Responses function events", () => {
    const stream = chatResponseToResponsesSse({
      id: "gen-tool",
      model: "openai/gpt-4o-mini",
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "read_file", arguments: '{"path":"a.txt"}' } }] } }],
    });
    expect(stream).toContain("event: response.function_call_arguments.done");
    expect(stream).toContain('"name":"read_file"');
    expect(stream).toContain('"call_id":"call-1"');
  });
});
