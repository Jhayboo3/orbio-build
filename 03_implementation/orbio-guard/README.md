# Orbio Guard

Local-first credit controls for Orbio-powered AI agents.

## Requirements

- Node.js 22 or newer.
- An Orbio account is required for authenticated MCP operations. Public OAuth discovery
  and configuration checks work without signing in.

## Setup

```bash
npm install
npm run typecheck
npm test
npm run dev -- doctor
npm run dev -- auth
npm run dev -- status
npm run dev -- init
npm run dev -- agent add --name "Demo" --daily-budget 5 --models "*"
npm run dev -- agent list
npm run dev -- key import
npm run dev -- serve
```

For machine-readable diagnostics:

```bash
npm run dev -- doctor --json
```

## Current status

- TypeScript/CLI scaffold.
- Validated runtime configuration.
- Live Orbio OAuth metadata discovery and unauthenticated MCP probe.
- OAuth authorization-code flow with PKCE, dynamic client registration, loopback
  callback state validation, refresh-token support, and owner-only local storage.
- Authenticated `auth`, `tools`, and `logout` CLI commands.
- Read-only authenticated `status` command for balance and account-key state.
- Persistent Guard agents with one-time hashed credentials and token rotation.
- Daily budgets, per-request ceilings, model allow-lists, pause/disable controls, and
  serialized reservation/confirm/release accounting.
- Unified request authorizer with stable policy failure codes.
- Owner-only upstream-key vault with fingerprint-only status output.
- Local OpenAI-compatible non-streaming chat completions proxy with upstream key
  isolation, conservative reservations, usage-cost reconciliation, timeout handling,
  and OpenAI-style Guard errors.
- Typed boundary and sanitized fixture for the authenticated five-tool runtime contract,
  plus detection of future tool-list changes.
- Recursive credential redaction.
- Initial unit tests.

Mutating Orbio tool-result capture, automatic key lifecycle, streaming, crash
reconciliation, spend ledger events, and dashboard work remain in later phases.
