# Developer and agent setup

Hosted guide: <https://orbio-guard.pages.dev/getting-started/>

Developers do not need the shared Orbio gateway key or access to the operator console.
They need an agent identity created by a Guard operator.

## 1. Request an agent

Send the operator:

- Project or workload name.
- Required model IDs.
- Expected UTC daily budget.
- Maximum acceptable cost per request.

The operator creates an identity at `https://guard.larkvine.org/dashboard/` and provides
one `og_agent_...` token. Guard displays it once and stores only its SHA-256 hash.

Store the token in a password manager, local environment, CI secret, or deployment secret
manager. Never commit it, put it in frontend code, or ask for the `sk-orbio-...` key.

## 2. Verify in a terminal

```bash
export ORBIO_GUARD_AGENT_TOKEN="og_agent_..."

curl https://api.guard.larkvine.org/v1/chat/completions \
  -H "Authorization: Bearer $ORBIO_GUARD_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.6-sol",
    "messages": [{"role": "user", "content": "Reply with: connected"}]
  }'
```

Use an allowed model from the policy supplied by the operator.

## 3. Configure an application

OpenAI-compatible clients need only the agent token and Guard base URL:

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ORBIO_GUARD_AGENT_TOKEN,
  baseURL: "https://api.guard.larkvine.org/v1",
});
```

The app sends the Guard token. Guard applies identity, status, model, request, and daily
budget rules before replacing it with the encrypted Orbio credential upstream.

## 4. Configure developer tools

### Codex

Add this provider to user-level `~/.codex/config.toml`:

```toml
model = "gpt-5.6-sol"
model_provider = "orbio_guard"

[model_providers.orbio_guard]
name = "Orbio Guard"
base_url = "https://api.guard.larkvine.org/v1"
env_key = "ORBIO_GUARD_AGENT_TOKEN"
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
```

Export `ORBIO_GUARD_AGENT_TOKEN` before launching Codex.

Guard adapts Codex's Responses protocol to Orbio's Chat Completions route. Text and
function-tool round trips are supported; developers should retain
`wire_api = "responses"`. Codex uses the native metadata slug `gpt-5.6-sol`; Guard maps
it to Orbio's `openai/gpt-5.6-sol` model ID.

### Claude Code

```bash
export ORBIO_GUARD_AGENT_TOKEN="og_agent_..."
export ANTHROPIC_BASE_URL="https://api.guard.larkvine.org"
export ANTHROPIC_AUTH_TOKEN="$ORBIO_GUARD_AGENT_TOKEN"
export ANTHROPIC_MODEL="anthropic/claude-sonnet-5"
claude
```

The agent policy must permit the selected Anthropic model.

### Cursor

If the installed Cursor version exposes an OpenAI-compatible base URL:

- Base URL: `https://api.guard.larkvine.org/v1`
- API key: the `og_agent_...` token
- Model: an ID allowed by the agent policy

Cursor does not guarantee this override in every build. When unavailable, use Codex,
Claude Code, or an OpenAI-compatible SDK.

### VS Code and JetBrains

Export the token in the integrated terminal and launch the application or AI tool from
that terminal. Run configurations may use a local environment variable, but workspace
files containing tokens must not be committed.

## 5. Handle errors

- `401 INVALID_AGENT_TOKEN`: token is missing or invalid; ask the operator for a new
  identity.
- `403 MODEL_NOT_ALLOWED`: select an allowed model or request a policy update.
- `403 AGENT_PAUSED` / `AGENT_DISABLED`: contact the operator; do not bypass Guard.
- `429 REQUEST_LIMIT_EXCEEDED`: request ceiling is too low for the configured reservation.
- `429 DAILY_BUDGET_EXCEEDED`: wait for UTC rollover or request a budget update.

## Local operator setup

Operators running Guard locally can generate equivalent target-specific instructions:

```bash
npm run dev -- setup codex --agent <agent-id> --model <model-id>
npm run dev -- setup claude --agent <agent-id> --model <model-id>
npm run dev -- setup cursor --agent <agent-id> --model <model-id>
```

These commands validate the selected model against the existing local agent policy and
never print or read back its raw token. Pass the provider-qualified Orbio ID, such as
`openai/gpt-5.6-sol`; the Codex generator writes the native `gpt-5.6-sol` metadata slug.
