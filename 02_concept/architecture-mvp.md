# MVP architecture — Orbio Guard (Node + TypeScript)

Planned vertical slice (implementation starts in `03_implementation/`).

## Repo layout (under 03_implementation/orbio-guard)
```
orbio-guard/
  package.json            # name: orbio-guard, deps incl. viem, hono?, @modelcontextprotocol/sdk
  tsconfig.json
  src/
    cli.ts                # entry: status | keys | serve | setup | auth
    config.ts             # local state dir (~/.orbio-guard.json), env parsing
    mcp.ts                # Orbio MCP client: get_balance/create_key/get_key_status/revoke_key
    auth.ts               # MCP 401 → browser sign-in handshake; token store
    policy.ts             # per-agent budgets, model allow-list, kill-switch
    rotation.ts           # leak detection (key reuse) + create/revoke rotation
    proxy.ts              # OpenAI/OpenRouter-compatible local proxy w/ budget enforcement
    chain.ts              # viem: read ORBIO balance, total supply, fee-volume accrual model
    dashboard/            # web UI (paper & ink tokens) — landing + guard dashboard
  cli-notes.md
```

## Key decisions
- **Standalone-first with MCP integration:** if Orbio MCP auth works headless, the hub
  creates/revokes real keys via `orbio_create_key`/`orbio_revoke_key`. Otherwise it
  manages a pool of keys the user claims from Orbio (paste). Budget/rotation/audit work
  either way.
- **Local proxy enforces the budget** on every request, so even if an agent ignores the
  MCP the wallet can't be blown; strict no-logging option.
- **Chain read is read-only** (public RPC / viem) — no signing needed for the MVP
  dashboard. Accrual is modeled from wallet share × fee volume (Orbio's exact ledger is
  off-chain; label as estimate).
- **State stays local** (JSON in `~/.orbio-guard`) — no backend needed for the MVP;
  demo-friendly and private. A public metrics page can be a static export.

## Milestones
1. CLI skeleton + config + `status` (viem balance read).
2. MCP auth + key CRUD against `https://www.orbio.so/api/mcp`.
3. Policy engine + budget enforcement unit tests.
4. Local OpenAI-compatible proxy + agent wiring (codex/claude/cursor).
5. Paper & ink dashboard (landing + live spend/keys view).
6. Demo script + pitch/technical walkthrough docs (see 02_concept).

## Verification
- `npm run dev` local UI; `orbio-guard serve` proxy; `orbio-guard status` wallet read.
- Test: budget-trip → kill → auto-create/rotate → continue (scripted demo).
