# Changelog

## 0.1.0-rc.1 - 2026-09-06

### Added

- OAuth authorization-code + PKCE integration with dynamic client registration and
  owner-only token persistence.
- Authenticated Orbio MCP contract discovery, balance/key status parsing, and guarded
  key creation, rotation, and revoke workflows.
- Per-agent identities, one-time hashed tokens, model allow-lists, kill switches,
  request ceilings, UTC daily budgets, and atomic reservations.
- Chat Completions, Responses, and Anthropic Messages proxying with SSE streaming and
  usage-cost reconciliation.
- Metadata-only ledger, responsive dashboard, health/readiness endpoints, and demo mode.
- Codex, Claude Code, and guided Cursor setup generation.
- Crash recovery, cross-process state locking, non-root Docker image, Compose profile,
  and GitHub Actions release checks.
- Synthetic screenshots, silent/narrated demo clips, product pitch video, technical
  walkthrough video, architecture diagrams, and submission documentation.

### Verified

- 53 automated tests.
- Desktop and mobile Chromium rendering.
- Docker build and non-root container smoke test.
- GitHub Actions release check and Docker build.
- Live Orbio OAuth, tool discovery, balance/status reads, and key creation.

### Known limitations

- The connected account currently has no spendable inference credit; live model requests
  reach the gateway but return `402 insufficient_quota`.
- Live key rotation and revoke remain intentionally unexecuted.
- Repository visibility remains private by operator request.
- Remote multi-tenant deployment is outside this release candidate's security model.
