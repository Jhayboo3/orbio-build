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
npm run dev -- key create --label "Orbio Guard"
npm run dev -- key status
npm run dev -- serve
npm run dev -- activity
npm run test:ui
npm run dev -- setup codex --agent <id> --model <model>
npm run dev -- demo --hold
npm run dev -- budget recover
npm run release:check
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
- OpenAI Chat Completions, Responses, and Anthropic Messages proxying with buffered and
  SSE streaming support, upstream key isolation, conservative reservations, usage-cost
  reconciliation, timeout handling, and compatible Guard errors.
- MCP-backed safe key creation/rotation and confirmed live key creation.
- Metadata-only activity ledger for agent, policy, budget, request, upstream, and key
  events.
- Responsive landing page and live paper-and-ink dashboard with secret-safe APIs.
- Policy-validated setup guides for Codex, Claude Code, and guided Cursor configuration.
- Deterministic two-agent mock demo with optional held dashboard for recording.
- Cross-process state locking and configurable stale-reservation recovery.
- `/healthz` and key-aware `/readyz` endpoints.
- Non-root Node 24 Docker image, localhost-only Compose profile, and GitHub Actions CI.
- Typed boundary and sanitized fixture for the authenticated five-tool runtime contract,
  plus detection of future tool-list changes.
- Recursive credential redaction.
- Initial unit tests.

Live key rotation/revocation, crash reconciliation, balance top-up, automatic Cursor
configuration, available inference credit, and public submission remain outstanding.
