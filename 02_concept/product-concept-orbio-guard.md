# Product concept — "Orbio Guard"

**One wallet. Many agents. Safe spend.**

A local credit-control layer that sits between your agents and the **Orbio MCP**
(`https://www.orbio.so/api/mcp`, tools for balance, claims, key creation, top-up,
rotation and deletion), letting a wallet's credits be shared safely across a whole team while
enforcing budgets, rotation and audit.

## Why this (gap)
- Orbio's primitive: "let an agent keep itself funded." Everyone will demo that.
- Unmet need: credits belong to the **wallet/account**; raw MCP gives no budgets,
  no per-agent limits, no shared-team model, no audit, no enforced rotation.

## Core features (MVP scope)
1. **Authenticate once** to the real Orbio MCP using OAuth + PKCE; proxy its 6 current
   tools through a version-tolerant adapter.
2. **Policy engine on top:**
   - per-agent / per-project **daily budgets**
   - model allow-list
   - kill-switch per agent
   - spend ledger + alerts (e.g., "agent hit 80% of budget")
3. **Leak-loop automation:** detect a key used by >1 agent → `orbio_rotate_key`
   (new secret) after verifying a safe rollback path.
4. **Agent wiring:** `orbio-guard setup codex|claude|cursor` points tools at the guard,
   which owns the live key (nobody shares a secret).
5. **OpenAI/OpenRouter-compatible local proxy** so SDKs work unchanged; budgets enforced
   per request; optional strict no-logging relay.
6. **On-chain accrual/status dashboard** (viem): ORBIO balance, floor status,
   accrual/hour model, spend, active keys, rotations.

## Non-goals (week 1)
- No new token/contract. No on-chain credit tokenization. No multi-wallet farming.

## Demo story (2 minutes)
Two agents race on one wallet → one blows its budget → guard kills it →
agent calls `orbio_create_key` → key rotated → it continues. Dashboard shows the
spend + rotation live.

## Name options
Orbio Guard · Orb Guard · Guardrail · Credit Ledger (pick one for the scaffold).

## Risks
- Orbio MCP auth must work headlessly (OAuth/browser sign-in). Mitigation: keep the
  manual key-pool fallback (paste claimed keys; guard still enforces budgets/rotation).
- Orbio ships daily features; watch for tool changes during the week.
