# Agent setup

Guard generates configuration from an existing agent policy. It never prints or reads
back the raw agent token.

```bash
npm run dev -- setup codex --agent <agent-id> --model <model-id>
npm run dev -- setup claude --agent <agent-id> --model <model-id>
npm run dev -- setup cursor --agent <agent-id> --model <model-id>
```

Export the agent's one-time token before launching the target tool:

```bash
export ORBIO_GUARD_AGENT_TOKEN="og_agent_..."
```

If the token was not saved, rotate it and update the target configuration:

```bash
npm run dev -- agent rotate-token <agent-id>
```

## Codex

Current Codex custom model providers use the Responses API. Guard supports
`POST /v1/responses` and SSE streaming, and the generated TOML uses:

- A user-level `~/.codex/config.toml` provider.
- `env_key = "ORBIO_GUARD_AGENT_TOKEN"`.
- `wire_api = "responses"`.
- `supports_websockets = false` so Codex stays on HTTP/SSE.

Provider settings must be user-level because Codex does not allow project config to
override machine-local model-provider routing.

## Claude Code

The generated shell variables point Claude Code to Guard's Anthropic Messages endpoint:

- `ANTHROPIC_BASE_URL=http://127.0.0.1:4318`
- `ANTHROPIC_AUTH_TOKEN=$ORBIO_GUARD_AGENT_TOKEN`
- `ANTHROPIC_MODEL=<allowed-model>`

Guard accepts both bearer and `x-api-key` authentication from Anthropic-compatible
clients and forwards the `anthropic-version` header.

## Cursor

Cursor setup remains guided/manual. Its public API-key documentation does not guarantee
a persistent custom OpenAI base URL in every build. If the installed Cursor version
offers a base-URL override in Models settings, use Guard's `/v1` URL and the Guard agent
token. Otherwise use an OpenAI-compatible SDK or another supported agent tool.

Do not enter the upstream Orbio key into Codex, Claude Code, or Cursor.
