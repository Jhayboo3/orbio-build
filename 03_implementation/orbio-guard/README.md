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
- Typed boundary and sanitized fixture for the authenticated five-tool runtime contract,
  plus detection of future tool-list changes.
- Recursive credential redaction.
- Initial unit tests.

Authenticated tool-result fixture capture, MCP tool execution, policy persistence,
proxying, and dashboard work remain in later phases.
