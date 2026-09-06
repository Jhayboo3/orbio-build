# Agent-compatible proxy

The proxy accepts OpenAI and Anthropic-compatible requests at:

- `POST /v1/chat/completions`
- `POST /v1/responses`
- `POST /v1/messages`

Buffered JSON and SSE streaming responses are supported.

It binds to loopback by default. Do not expose the proxy to a network interface until
transport authentication, TLS, and deployment-specific access controls are added.

## Configure the upstream Orbio key

Guard never accepts the upstream key as a command-line argument because shell history
can preserve arguments.

```bash
export ORBIO_GUARD_UPSTREAM_KEY="your-key"
npm run dev -- key import
unset ORBIO_GUARD_UPSTREAM_KEY
npm run dev -- key status
```

The key is stored in `~/.orbio-guard/upstream.json` with owner-only permissions. Guard
shows only a SHA-256 fingerprint after import.

The authenticated key-status response currently reports `https://orbio.so/api/v1`,
which redirects to the canonical `https://www.orbio.so/api/v1` origin. Guard normalizes
that host before forwarding so the authorization header is not lost across the redirect.
Override it only
when Orbio reports a different URL:

```bash
export ORBIO_GUARD_UPSTREAM_BASE_URL="https://www.orbio.so/api/v1"
```

## Create a Guard agent

```bash
npm run dev -- agent add \
  --name "Codex worker" \
  --daily-budget 5 \
  --max-request 0.50 \
  --models "openai/gpt-*"
```

Save the one-time `og_agent_...` token. Agents receive this Guard credential, never the
upstream Orbio key.

## Start the proxy

```bash
npm run dev -- serve
```

## Call with cURL

```bash
curl http://127.0.0.1:4318/v1/chat/completions \
  -H "Authorization: Bearer $ORBIO_GUARD_AGENT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "openai/gpt-6",
    "messages": [{"role": "user", "content": "Say hello"}]
  }'
```

## Call with the OpenAI SDK

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.ORBIO_GUARD_AGENT_TOKEN,
  baseURL: "http://127.0.0.1:4318/v1",
});

const response = await client.chat.completions.create({
  model: "openai/gpt-6",
  messages: [{ role: "user", content: "Say hello" }],
});
```

The Responses API uses the same base URL and Guard token:

```ts
const response = await client.responses.create({
  model: "openai/gpt-6",
  input: "Say hello",
});
```

## Enforcement behavior

1. Validate endpoint, JSON body, model, and protocol shape.
2. Authenticate the Guard token.
3. Enforce agent status, model allow-list, and request ceiling.
4. Reserve spend atomically against the UTC daily budget.
5. Load the upstream key only inside the proxy process.
6. Forward the request with the upstream key replacing the Guard credential.
7. Forward buffered responses or stream SSE chunks to the client.
8. Confirm provider-reported `usage.cost`, including cost found in final SSE events, or
   conservatively confirm the reservation when a successful response omits cost.
9. Release the reservation after an unpriced upstream failure or cancellation.

Guard converts provider-reported USD cost to integer micro-dollars for local
accounting.

## Current MVP limitations

- Default reservation is `$0.25` when the agent has no per-request ceiling. Configure
  `ORBIO_GUARD_DEFAULT_RESERVATION_USD` conservatively for the expected workload.
- Request bodies default to a 1 MiB maximum.
- One Guard proxy process may use a state directory at a time.
- Automatic creation/rotation of the upstream key through MCP remains pending live
  mutating-tool fixture capture.
- Reconciliation after a process crash or uncertain upstream timeout remains pending.

## Error codes

- `INVALID_AGENT_TOKEN` — missing or invalid Guard credential.
- `AGENT_PAUSED` / `AGENT_DISABLED` — operator kill switch.
- `MODEL_NOT_ALLOWED` — requested model is outside policy.
- `REQUEST_LIMIT_EXCEEDED` — reservation exceeds per-request policy.
- `DAILY_BUDGET_EXCEEDED` — confirmed plus reserved spend exceeds the UTC limit.
- `INVALID_REQUEST` / `BODY_TOO_LARGE` — malformed or oversized request.
- `UPSTREAM_TIMEOUT` / `UPSTREAM_ERROR` — provider request failed.
