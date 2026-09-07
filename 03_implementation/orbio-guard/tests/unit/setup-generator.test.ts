import { describe, expect, it } from "vitest";
import { createGuardAgent } from "../../src/domain/agent.js";
import { generateSetupGuide } from "../../src/setup/generator.js";

const agent = createGuardAgent({
  allowedModels: ["openai/*", "anthropic/*"],
  dailyBudgetMicroUsd: "1000000",
  name: "Setup agent",
}).agent;

describe("generateSetupGuide", () => {
  it("generates a Responses-only Codex provider", () => {
    const guide = generateSetupGuide({
      agent,
      baseUrl: new URL("http://127.0.0.1:4318"),
      model: "openai/gpt-test",
      target: "codex",
    });

    expect(guide.snippet).toContain('base_url = "http://127.0.0.1:4318/v1"');
    expect(guide.snippet).toContain('model = "gpt-test"');
    expect(guide.snippet).not.toContain('model = "openai/gpt-test"');
    expect(guide.snippet).toContain('wire_api = "responses"');
    expect(guide.snippet).toContain('env_key = "ORBIO_GUARD_AGENT_TOKEN"');
    expect(guide.snippet).not.toContain(agent.tokenHash);
  });

  it("generates Claude Code gateway environment variables", () => {
    const guide = generateSetupGuide({
      agent,
      baseUrl: new URL("http://127.0.0.1:4318"),
      model: "anthropic/claude-test",
      target: "claude",
    });

    expect(guide.snippet).toContain("ANTHROPIC_BASE_URL='http://127.0.0.1:4318'");
    expect(guide.snippet).toContain('ANTHROPIC_AUTH_TOKEN="$ORBIO_GUARD_AGENT_TOKEN"');
  });

  it("rejects models outside the agent policy", () => {
    expect(() =>
      generateSetupGuide({
        agent,
        baseUrl: new URL("http://127.0.0.1:4318"),
        model: "google/gemini-test",
        target: "cursor",
      }),
    ).toThrow("not allowed");
  });
});
