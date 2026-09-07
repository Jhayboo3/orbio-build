# Changelog

## Unreleased

### Added

- Catalog-priced hard admission bounds using fixed-point arithmetic, conservative input
  token bounds, injected output limits, and the highest applicable model rate.
- Cloud token rotation, model-catalog caching, malformed-token rejection before tenant
  lookup, and a 120 requests/minute Cloudflare rate-limit binding.
- Explicit public synthetic-data banner and a contest-ready repository front door.

### Changed

- Public claims now scope Guard to text and function-tool agents and describe 430 models
  as Orbio coverage governed by Guard.

### Verified

- 73 automated tests, including pricing bounds, multimodal fail-closed behavior,
  credential encryption, token routing, and protocol adaptation.

## 0.1.0-rc.5 - 2026-09-07

### Added

- Access-protected cloud operator controls for creating, pausing, resuming, disabling,
  and archiving Guard agents.
- One-time token presentation, activity filters, explicit reservation-ceiling labels,
  inference endpoint visibility, and cloud environment status.
- Same-origin validation for cloud admin mutations and derived key last-used status from
  confirmed inference spend.
- Beginner developer onboarding for terminal, JavaScript, Python, Codex, Claude Code,
  Cursor, VS Code, and JetBrains, available as a hosted guide and repository reference.
- Accessible copy controls for every onboarding command and configuration block, with
  language labels, clipboard fallback, and visible success feedback.
- Responses-to-Chat protocol adaptation for Codex, including SSE response events,
  function tools, tool outputs, usage, and provider-cost reconciliation.
- Authenticated Orbio model-catalog proxying and native Codex-slug normalization to
  provider-qualified Orbio model IDs.
- Beginner-first onboarding rewritten as a literal save, verify, configure, load, doctor,
  and launch checklist, with expected output and fixes for observed Keychain/Codex errors.
- Multi-tenant Cloudflare isolation with one Durable Object per Access identity, scoped
  agent tokens, Orbio OAuth + PKCE connection, encrypted per-tenant tokens/keys, session
  refresh, and explicit existing-key replacement consent.
- Contest-facing product story centered on self-service Orbio connection, real Codex
  agent work, tenant isolation, live model evidence, and pre-key-access enforcement.
- Regenerated pitch, technical walkthrough, and screenshot artifacts using the current
  cloud architecture and explicit synthetic/live labels.

### Verified

- 69 automated tests and desktop/mobile cloud-console rendering.
- Two disabled smoke identities archived while preserving their metadata-only history.
- Real Codex text and shell-tool round trips completed through Guard and Orbio.
- Authenticated catalog returned 430 models; Codex Doctor passed all 22 checks and a live
  `gpt-5.6-sol` request completed without fallback metadata.
- Primary-tenant migration, cross-tenant agent isolation, encrypted credential round trip,
  and tenant OAuth authorization URL were verified without rotating another account key.

## 0.1.0-rc.4 - 2026-09-07

### Added

- Public Cloudflare Pages product site and synthetic dashboard at
  `https://orbio-guard.pages.dev`.
- Full Cloudflare Worker runtime with a SQLite-backed Durable Object for agents, policies,
  UTC daily budgets, reservations, spend reconciliation, and metadata-only activity.
- Separate Access-protected operator and token-authenticated inference hostnames at
  `guard.larkvine.org` and `api.guard.larkvine.org`.
- Cloudflare-specific type checking, build scripts, deployment configuration, security
  headers, and policy/cost unit coverage.

### Verified

- 61 automated tests, local and Worker type checking, production builds,
  desktop/mobile Chromium rendering, and zero dependency vulnerabilities.
- Cloudflare Access redirects unauthenticated operator requests and the Worker rejects
  direct `workers.dev` bypass attempts.
- A persistent agent completed live `openai/gpt-4o-mini` inference through the Worker and
  Durable Object accounting path with HTTP 200.
- The Orbio gateway key remains an encrypted Worker secret; bootstrap access was deleted.

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
