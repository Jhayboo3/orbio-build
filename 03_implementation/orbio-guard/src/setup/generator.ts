import type { GuardAgent } from "../domain/agent.js";
import { matchesModel } from "../domain/policy.js";

export type SetupTarget = "claude" | "codex" | "cursor";

export interface SetupGuide {
  notes: string[];
  snippet: string;
  target: SetupTarget;
}

export function generateSetupGuide(input: {
  agent: GuardAgent;
  baseUrl: URL;
  model: string;
  target: SetupTarget;
}): SetupGuide {
  if (!input.agent.allowedModels.some((pattern) => matchesModel(pattern, input.model))) {
    throw new Error(
      `Model "${input.model}" is not allowed by agent "${input.agent.name}".`,
    );
  }

  const rootUrl = input.baseUrl.toString().replace(/\/$/, "");
  const versionedUrl = `${rootUrl}/v1`;
  const tokenInstruction =
    `Export ORBIO_GUARD_AGENT_TOKEN with the one-time token for ${input.agent.name}. ` +
    `If it was lost, run \`orbio-guard agent rotate-token ${input.agent.id}\`.`;

  if (input.target === "codex") {
    const codexModel = input.model.startsWith("openai/")
      ? input.model.slice("openai/".length)
      : input.model;
    return {
      target: "codex",
      notes: [
        tokenInstruction,
        "Add this provider to the user-level ~/.codex/config.toml; project-local config cannot override model providers.",
        "Guard supports the Responses API and SSE streaming required by current Codex custom providers.",
      ],
      snippet: [
        `model = ${tomlString(codexModel)}`,
        'model_provider = "orbio_guard"',
        "",
        "[model_providers.orbio_guard]",
        'name = "Orbio Guard"',
        `base_url = ${tomlString(versionedUrl)}`,
        'env_key = "ORBIO_GUARD_AGENT_TOKEN"',
        'env_key_instructions = "Use the one-time Guard agent token, not the Orbio upstream key."',
        'wire_api = "responses"',
        "requires_openai_auth = false",
        "supports_websockets = false",
      ].join("\n"),
    };
  }

  if (input.target === "claude") {
    return {
      target: "claude",
      notes: [
        tokenInstruction,
        "Guard accepts Anthropic Messages requests and x-api-key or Authorization bearer authentication.",
        "Set these variables in the shell that launches Claude Code; do not place the token in the repository.",
      ],
      snippet: [
        `export ANTHROPIC_BASE_URL=${shellQuote(rootUrl)}`,
        'export ANTHROPIC_AUTH_TOKEN="$ORBIO_GUARD_AGENT_TOKEN"',
        `export ANTHROPIC_MODEL=${shellQuote(input.model)}`,
      ].join("\n"),
    };
  }

  return {
    target: "cursor",
    notes: [
      tokenInstruction,
      "Cursor support is manual because its public API-key documentation does not guarantee a persistent custom OpenAI base URL in every build.",
      "If your Cursor Models settings expose an OpenAI base URL override, use the values below. Otherwise use a generic OpenAI-compatible client through Guard.",
    ],
    snippet: [
      `Base URL: ${versionedUrl}`,
      "API key: value of ORBIO_GUARD_AGENT_TOKEN",
      `Model: ${input.model}`,
    ].join("\n"),
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
