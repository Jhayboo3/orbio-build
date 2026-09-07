# Developer setup: start with Codex

Hosted step-by-step guide: <https://orbio-guard.pages.dev/getting-started/>

This is the shortest path for a developer who has never used Guard. Complete each step
in order.

## Step 1: Get a Guard agent

Ask the Guard operator to create an agent with:

```text
Name: your name or tool
Project: your project
Allowed model: openai/gpt-5.6-sol
Daily budget: $5.00
Per-request limit: $0.25
```

The operator uses `https://guard.larkvine.org/dashboard/` and gives you a one-time token
beginning with `og_agent_`.

You do not need the shared `sk-orbio-...` key. Never request or store it.

## Step 2: Save the token on macOS

Copy this command exactly. Do not add the token to the command:

```bash
security add-generic-password -U \
  -a "$USER" \
  -s "orbio-guard-codex" \
  -w
```

Terminal now waits for a password. Paste the complete `og_agent_...` token and press
Return. The token can remain invisible while pasting; that is normal.

Verify the item exists without printing the token:

```bash
security find-generic-password \
  -a "$USER" \
  -s "orbio-guard-codex" \
  >/dev/null && echo "Guard token saved"
```

Expected output:

```text
Guard token saved
```

Do not use `security add-generic-password -U \og_agent_...`. The `-U` flag means
“update”; it is not where the password goes.

## Step 3: Configure Codex

Open the configuration:

```bash
mkdir -p ~/.codex
nano ~/.codex/config.toml
```

Add the following. Replace existing top-level `model` and `model_provider` lines instead
of creating duplicates:

```toml
model = "gpt-5.6-sol"
model_provider = "orbio_guard"

[model_providers.orbio_guard]
name = "Orbio Guard"
base_url = "https://api.guard.larkvine.org/v1"
env_key = "ORBIO_GUARD_AGENT_TOKEN"
env_key_instructions = "Use your Guard agent token, not the Orbio key."
wire_api = "responses"
requires_openai_auth = false
supports_websockets = false
```

In nano, save with Control+O, press Return, then exit with Control+X.

Codex uses `gpt-5.6-sol` for built-in model metadata. Guard maps it to Orbio's
`openai/gpt-5.6-sol` ID.

## Step 4: Load the token

Run this in every new Terminal window before starting Codex:

```bash
export ORBIO_GUARD_AGENT_TOKEN="$(
  security find-generic-password \
    -a "$USER" \
    -s "orbio-guard-codex" \
    -w
)"
```

Verify without printing the token:

```bash
if [ -n "$ORBIO_GUARD_AGENT_TOKEN" ]; then
  echo "Guard token loaded"
else
  echo "Guard token missing"
fi
```

Expected output: `Guard token loaded`.

## Step 5: Verify Codex

```bash
codex --strict-config doctor --summary
```

Expected result:

```text
22 ok · 0 warn · 0 fail
```

The provider must be `orbio_guard`. If Codex reports `openrouter.ai`, return to step 3
and replace the top-level `model_provider` value.

## Step 6: Start Codex

```bash
codex
```

The header should show `model: gpt-5.6-sol`. Use Codex normally after that.

## Optional terminal test

```bash
curl https://api.guard.larkvine.org/v1/chat/completions \
  -H "Authorization: Bearer $ORBIO_GUARD_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-5.6-sol",
    "messages": [{"role": "user", "content": "Reply with: connected"}]
  }'
```

List Orbio's current authenticated model catalog:

```bash
curl https://api.guard.larkvine.org/v1/models \
  -H "Authorization: Bearer $ORBIO_GUARD_AGENT_TOKEN"
```

## Other tools

### Claude Code

```bash
export ANTHROPIC_BASE_URL="https://api.guard.larkvine.org"
export ANTHROPIC_AUTH_TOKEN="$ORBIO_GUARD_AGENT_TOKEN"
export ANTHROPIC_MODEL="anthropic/claude-sonnet-5"
claude
```

### OpenAI SDK

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ORBIO_GUARD_AGENT_TOKEN,
  baseURL: "https://api.guard.larkvine.org/v1",
});
```

### VS Code and JetBrains

Open the IDE terminal, complete step 4, then run Codex, Claude Code, or the application
from that same terminal. Do not commit workspace settings containing a token.

### Cursor

If Cursor exposes a custom OpenAI-compatible provider, use:

- Base URL: `https://api.guard.larkvine.org/v1`
- API key: your `og_agent_...` token
- Model: `openai/gpt-5.6-sol`

## Common errors

- `Keychain item not found`: step 2 did not finish; save and verify the token again.
- `security` prints its Usage page: the command was malformed; copy step 2 exactly.
- `openrouter.ai` appears: Codex is not using `model_provider = "orbio_guard"`.
- `Model metadata not found`: use `gpt-5.6-sol` in Codex, not the qualified Orbio ID.
- `401 INVALID_AGENT_TOKEN`: reload the token or replace an exposed identity.
- `403 MODEL_NOT_ALLOWED`: ask the operator to allow the selected model.
- `429`: the request ceiling or UTC daily budget has been reached.

## Local operator generator

Local Guard operators can generate target-specific setup after creating a local agent:

```bash
npm run dev -- setup codex --agent <agent-id> --model openai/gpt-5.6-sol
npm run dev -- setup claude --agent <agent-id> --model anthropic/claude-sonnet-5
npm run dev -- setup cursor --agent <agent-id> --model openai/gpt-5.6-sol
```
