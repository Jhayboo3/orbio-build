# Agent identities and policies

Guard agents are local identities that share the single upstream Orbio account key
without receiving that key directly.

## Initialize local state

```bash
npm run dev -- init
```

The state file defaults to `~/.orbio-guard/guard.json`. Its directory and file use
owner-only permissions. Writes use temporary-file plus rename semantics.

## Create an agent

```bash
npm run dev -- agent add \
  --name "Research worker" \
  --project "orbio-demo" \
  --daily-budget 5 \
  --max-request 0.75 \
  --models "openai/gpt-*,anthropic/claude-sonnet-5"
```

The command prints a Guard token once. Only its SHA-256 hash is stored. The raw token
must be placed in that agent's configuration and cannot be recovered later.

## Inspect and control agents

```bash
npm run dev -- agent list
npm run dev -- agent pause <agent-id>
npm run dev -- agent resume <agent-id>
npm run dev -- agent disable <agent-id>
npm run dev -- agent rotate-token <agent-id>
```

Token rotation invalidates the previous Guard credential immediately after the updated
state is persisted.

## Inspect and update policy

```bash
npm run dev -- policy show <agent-id>
npm run dev -- policy set <agent-id> --daily-budget 8
npm run dev -- policy set <agent-id> --max-request none
npm run dev -- policy set <agent-id> --models "openai/*"
```

Model patterns support exact IDs, `*`, or a single trailing wildcard. Examples:

- `anthropic/claude-sonnet-5` matches one exact model.
- `openai/gpt-*` matches model IDs beginning with `openai/gpt-`.
- `*` allows every model.

## Enforcement order

Before an upstream request can start, Guard:

1. Hashes and resolves the Guard token.
2. Rejects paused or disabled agents.
3. Checks the requested model.
4. Checks the per-request estimated-cost ceiling.
5. Atomically reserves estimated spend against the agent's UTC daily budget.

Stable failure codes are `INVALID_AGENT_TOKEN`, `AGENT_PAUSED`, `AGENT_DISABLED`,
`MODEL_NOT_ALLOWED`, `REQUEST_LIMIT_EXCEEDED`, and `DAILY_BUDGET_EXCEEDED`.

## Budget lifecycle

- Reserve before sending the upstream request.
- Confirm with actual provider cost after a successful response.
- Release after an upstream failure or cancellation.
- Daily accounting rolls over at midnight UTC while prior records remain available.

Reservations are serialized inside the active Guard process. The MVP must run one proxy
process per state directory; multi-process/distributed locking is deferred.
