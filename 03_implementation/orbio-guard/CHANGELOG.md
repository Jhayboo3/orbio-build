# Changelog

## 0.1.0-rc.3 - 2026-09-07

### Added

- Guarded migration of remaining legacy OpenRouter-key credit into the current Orbio
  account balance, with irreversible-operation confirmation and metadata-only auditing.
- Post-migration verification of both legacy-key disablement and the expected spendable
  balance increase.

### Verified

- 57 automated tests, production build, desktop/mobile Chromium rendering, and dependency
  audit.
- Live Orbio status reports an active gateway key and spendable inference credit.
- Explicit live key rotation replaced the stale local vault copy and recorded only the
  new key fingerprint.
- A limited `openai/gpt-4o-mini` request completed through the Guard proxy with HTTP 200,
  confirmed $0.000007 of spend, and the temporary agent was disabled immediately.

## 0.1.0-rc.2 - 2026-09-06

### Added

- Full-length synthetic narrated product and technical walkthrough videos.
- Dedicated technical architecture presentation page.
- Submission-readiness auditing for OAuth, key state, credit, permissions, Git status,
  release visibility, tag alignment, and media duration.
- Timed dashboard regression coverage for remote key-state persistence.

### Changed

- Updated verification evidence from 53 to 55 automated tests.
- Preserved remote key health across frequent local dashboard refreshes.

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

- 55 automated tests on the current release candidate.
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
