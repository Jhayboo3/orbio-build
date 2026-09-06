# Pitch script - under three minutes

Updated: 2026-09-06

Target length: approximately 2 minutes 15 seconds.

## 0:00-0:20 - Problem

> Orbio gives an agent a key that can fund its own inference. But the moment one wallet
> powers several agents, repositories, or teammates, the operator loses control. There
> are no per-agent budgets, no model rules, no fleet kill switch, and everyone is tempted
> to share the same secret.

## 0:20-0:45 - Product

> This is Orbio Guard: one wallet, many agents, safe spend. Guard runs locally between
> agent tools and the Orbio gateway. Every agent receives its own Guard identity while
> the real Orbio key stays inside an owner-only vault.

Show the landing page and enter the dashboard.

## 0:45-1:25 - Demo

> Here are two agents sharing one account. Alpha has a larger research budget. Beta has
> a twenty-cent coding budget. Both requests pass through the same proxy, but policy is
> enforced separately.

Run `orbio-guard demo --hold`.

> Alpha succeeds. Beta succeeds once. On Beta's second request, Guard atomically checks
> confirmed plus in-flight spend, returns a 429 before the upstream key is touched, and
> writes the decision to the ledger. Alpha continues working. One agent tripping a limit
> does not stop the fleet.

Show the agent table, spend bars, and activity events.

## 1:25-1:55 - Technical differentiation

> Guard is not another agent wrapper. It is credit-control infrastructure. It supports
> OpenAI Chat Completions, the Responses API used by Codex, Anthropic Messages for Claude
> Code, and streaming usage reconciliation. OAuth uses PKCE. Key creation has an atomic
> recovery path. State writes are locked across processes, and crash recovery confirms
> uncertain reservations by default.

## 1:55-2:15 - Orbio alignment and close

> This makes Orbio credits safer to use across real agent fleets. It drives more gateway
> usage without asking teams to share secrets or trust every agent with the full wallet
> balance. Orbio funds the key. Guard controls the work.

> One wallet. Many agents. Safe spend.

## Recording notes

- Keep demo mode visibly labeled.
- Never show terminal output containing an agent or Orbio key.
- Show the live-created key fingerprint only.
- State that the connected account currently needs spendable credit for a live model
  response.
