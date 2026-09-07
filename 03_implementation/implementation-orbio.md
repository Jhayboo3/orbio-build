# Orbio Guard implementation plan

Updated: 2026-09-07

This is the build guide and delivery checklist for **Orbio Guard**: a local-first
credit-control layer between AI agents and Orbio/OpenRouter. It converts the product
concept in `../02_concept/` into implementation phases, test gates, demo requirements,
and release criteria.

## Current progress

- **Phase 0 - In progress:** OAuth authentication and the authenticated five-tool
  `tools/list` schema capture are complete. Read-only result schemas are implemented
  using synthetic fixtures, and live create-key behavior is verified. Revoke and legacy
  delete fixtures remain.
- **Phase 1 - Scaffold complete:** TypeScript CLI, configuration validation, OAuth
  discovery probe, redaction utilities, build scripts, and initial tests are working.
- **Phase 2 - Control core complete:** persistent Guard identities, one-time hashed
  credentials, model/status/request policies, UTC daily budgets, and serialized
  reservation/confirm/release accounting are implemented. Policy/spend ledger events
  remain for the proxy milestone.
- **Phase 3 - In progress:** the owner-only key vault and MCP-backed guarded
  create/rotate/revoke commands are implemented. Live key creation and rotation are
  verified; live revoke remains intentionally unexecuted.
- **Phase 4 - Proxy core complete:** local-only Chat Completions, Responses, and
  Anthropic Messages enforce Guard identity and policy, reserve spend, isolate the Orbio
  key, reconcile buffered/SSE provider cost, and release unpriced failures. Crash
  recovery remains deferred. A limited live `openai/gpt-4o-mini` request completed
  through Guard with HTTP 200 and provider-reported spend reconciliation.
- **Ledger - Core complete:** metadata-only agent, policy, budget, request, upstream,
  and key events are persisted without prompts, responses, or raw credentials.
- **Phase 6 - Dashboard complete:** responsive landing/dashboard views show masked live
  Orbio status, Guard agents, budgets, key health, and metadata-only activity. Remote
  refresh is non-interactive and degrades safely.
- **Phase 5 - Setup core complete:** policy-validated configuration is generated for
  Codex Responses providers and Claude Code gateways. Cursor remains guided/manual where
  its installed build exposes a base-URL override.
- **Phase 7 - Demo core complete:** a deterministic two-agent mock run proves one agent
  can trip its budget while the rest of the fleet continues, with an optional held
  dashboard for recording.
- **Crash recovery complete:** state updates use a cross-process lock; startup recovers
  stale reservations with conservative `confirm` behavior by default and optional
  operator-directed release.
- **Phase 8 - Packaging complete:** release checks, health/readiness endpoints, GitHub
  Actions CI, a non-root Node 24 image, localhost-only Compose profile, security policy,
  deployment guide, and submission checklist are implemented.
- **Validation:** typecheck, fifty-seven automated tests, production build, desktop/mobile
  Playwright rendering with zero browser errors or horizontal overflow,
  mock-upstream proxy integration, live OAuth discovery, authenticated reconnect,
  read-only status calls, isolated CLI workflow, npm audit, Docker build, non-root
  container startup, dashboard serving, and health/readiness smoke checks pass.
- **Submission blockers:** the repository is intentionally private and the GitHub release
  remains a draft. Live rotation and inference are verified. Submission-length synthetic
  pitch and technical videos are ready; personal re-narration is optional.
- **Submission materials prepared:** synthetic desktop/mobile screenshots, architecture
  diagrams, timed pitch and technical scripts, troubleshooting, security, deployment,
  and final submission guides are complete.
- **Release candidate:** `v0.1.0-rc.6` prepared on September 7, 2026.

## 1. MVP outcome

By the end of the MVP, a user can:

1. Connect one Orbio account or provide a manually claimed Orbio key.
2. Register multiple agents or projects with separate identities and policies.
3. Route OpenAI-compatible requests through a local proxy without changing normal SDK
   usage beyond the base URL and agent token.
4. Enforce daily budgets, model allow-lists, disabled-agent kill switches, and request
   limits before traffic reaches Orbio.
5. Record request metadata, token usage, cost, policy decisions, key events, and errors
   without storing prompts or model responses.
6. Rotate or revoke a compromised key while preserving wallet credits.
7. View wallet, agent, key, budget, and activity status in a local dashboard.
8. Run the complete hackathon demo: two agents spend concurrently, one reaches its
   limit, the guard blocks it, rotates its key, and records the sequence live.

## 2. Scope boundaries

### Required for the hackathon MVP

- Node.js and TypeScript application under `03_implementation/orbio-guard/`.
- Local CLI for initialization, authentication, status, policy management, setup, and
  server control.
- Orbio MCP adapter with manual-key fallback.
- OpenAI/OpenRouter-compatible proxy for chat/completions-style traffic.
- Per-agent identity and authentication at the proxy boundary.
- Policy engine with budget, model, status, and request-size checks.
- Local persistence with safe, atomic writes.
- Key lifecycle management: import, create when supported, rotate, revoke, and status.
- Metadata-only audit ledger.
- Local dashboard and scripted demonstration.
- Automated unit and integration tests for the critical control path.

### Deferred until after the MVP

- Cloud-hosted multi-tenant service.
- Organization billing, invitations, and role-based access control.
- New smart contracts, tokenization, or custody of funds.
- Multi-wallet optimization or farming.
- Full compatibility with every OpenRouter endpoint and streaming mode.
- Production-grade distributed rate limiting and high availability.
- Automated behavioral leak detection beyond deterministic key/agent mismatch rules.

## 3. Delivery principles

- **Demo-first:** complete one real vertical slice before expanding the feature set.
- **Fail closed:** uncertain identity, budget, key, or policy state blocks the request.
- **Secrets stay local:** never write raw keys to logs, ledger entries, UI payloads, or
  test snapshots.
- **Metadata only:** store model, tokens, cost, latency, agent, decision, and timestamps;
  do not store prompts or model output.
- **Adapters over assumptions:** isolate Orbio MCP behavior behind an interface because
  tool names, authentication, and response formats may change during Build Week.
- **Honest metrics:** clearly label on-chain accrual calculations as estimates when the
  source of truth is off-chain.
- **Small public surface:** bind locally by default and require explicit configuration
  before listening on a non-loopback interface.

## 4. Proposed project layout

```text
03_implementation/orbio-guard/
  package.json
  tsconfig.json
  README.md
  .env.example
  src/
    cli.ts
    app.ts
    config/
      schema.ts
      store.ts
    domain/
      agent.ts
      budget.ts
      key.ts
      ledger.ts
      policy.ts
    orbio/
      client.ts
      mcp-client.ts
      manual-key-client.ts
      types.ts
    proxy/
      server.ts
      authentication.ts
      request-normalizer.ts
      usage.ts
      upstream.ts
    rotation/
      coordinator.ts
      detector.ts
    chain/
      client.ts
      contracts.ts
      accrual.ts
    dashboard/
      components/
      pages/
      styles/
    shared/
      errors.ts
      logger.ts
      redaction.ts
      time.ts
  tests/
    unit/
    integration/
    fixtures/
    e2e/
  scripts/
    demo.ts
    smoke.ts
```

Keep domain and policy logic independent from HTTP, MCP, CLI, and UI code so it can be
tested deterministically.

## 5. Core data model

The exact storage implementation may change, but these concepts must remain explicit.

### Agent

- `id`: stable internal identifier.
- `name`: human-readable label.
- `tokenHash`: hash of the proxy credential issued to this agent.
- `project`: optional project or repository label.
- `status`: `active`, `paused`, or `disabled`.
- `dailyBudgetUsd`: maximum confirmed plus reserved spend per UTC day.
- `allowedModels`: exact model IDs or approved patterns.
- `maxRequestUsd`: optional per-request ceiling.
- `createdAt` and `updatedAt`.

### Managed key

- `id`: internal identifier; never the raw key.
- `fingerprint`: non-secret hash suffix used for display and correlation.
- `provider`: `orbio-mcp` or `manual`.
- `status`: `active`, `rotating`, `revoked`, or `error`.
- `assignedAgentIds`: Guard-side identities currently allowed to use the one upstream
  account key through the proxy.
- `createdAt`, `rotatedAt`, and `revokedAt`.
- Secret material stored separately from normal configuration and ledger records.

### Budget record

- UTC date and agent ID.
- Confirmed spend from completed upstream responses.
- Reserved spend for in-flight requests.
- Request count and last updated timestamp.

### Ledger event

- Event ID, timestamp, agent ID, request ID, and model.
- Event type: request allowed, request blocked, spend confirmed, key created, key
  rotated, key revoked, upstream error, or policy changed.
- Estimated and confirmed cost when available.
- Input/output token counts when returned by the provider.
- Policy reason code, latency, and HTTP status.
- No authorization headers, raw keys, prompts, responses, or complete upstream bodies.

## 6. Critical request flow

1. The agent sends a request to the local proxy with its Guard-issued credential.
2. The proxy resolves the credential to exactly one active agent.
3. The request normalizer validates the endpoint, model, body size, and supported mode.
4. The policy engine checks agent status, model permissions, request ceiling, and daily
   budget.
5. The budget service atomically reserves an estimated maximum request cost.
6. The proxy chooses the agent's managed Orbio key and forwards the request.
7. On success, confirmed usage replaces the reservation and a metadata ledger event is
   written.
8. On failure or cancellation, the reservation is released and the error is recorded.
9. If usage reaches an alert or enforcement threshold, the policy/rotation coordinator
   updates agent or key state.

Budget checking and reservation must be atomic so concurrent agents cannot both pass a
check against the same remaining balance.

## 7. Implementation phases

### Phase 0 - Validate Orbio integration

**Goal:** replace assumptions with captured MCP behavior before building around it.

Implementation:

- Connect to `https://www.orbio.so/api/mcp` using the documented browser sign-in flow.
- Discover and record the actual tool list, JSON schemas, authentication lifecycle,
  errors, and response shapes.
- Verify balance, create/import key, key status, rotation semantics, and revocation.
- Confirmed: runtime rotation is `orbio_create_key`, which retires an existing key in
  the same statement.
- Determine whether balance/status results expose enough spend data for reconciliation;
  agent attribution remains a Guard-side responsibility.
- Create sanitized JSON fixtures from successful and failed responses.
- Define an `OrbioClient` interface so the real MCP client and manual fallback share the
  same application contract.

Deliverables:

- Sanitized integration notes in the implementation repository.
- Typed request/response schemas and fixtures.
- A command that can authenticate and print a redacted account/key status.

Exit checks:

- No raw key or session token appears in terminal history, logs, or fixtures.
- Every MCP operation has a captured success and expected-error case.
- Manual-key mode works when MCP authentication is unavailable.

### Phase 1 - Scaffold and configuration

**Goal:** establish a runnable, testable TypeScript application.

Implementation:

- Create the package, TypeScript configuration, CLI entry point, test runner, linting,
  formatting, and development scripts.
- Add runtime configuration validation; reject invalid ports, URLs, addresses, and
  budgets at startup.
- Create the local state directory with owner-only permissions where supported.
- Implement atomic state writes using temporary-file plus rename semantics.
- Implement structured logging with centralized secret/header redaction.
- Add a fake clock and deterministic IDs for tests.

Suggested commands:

```bash
npm install
npm run dev
npm run typecheck
npm test
```

Exit checks:

- Fresh clone/setup can run using documented commands.
- Invalid configuration fails with an actionable message.
- Interrupted writes do not corrupt the last valid state file.
- Logs redact bearer tokens, API keys, cookies, and authorization headers.

### Phase 2 - Agent identity and policy engine

**Goal:** make policy decisions independently of the proxy and provider.

Implementation:

- Add agent creation, listing, pause, resume, disable, and credential rotation commands.
- Store only hashes of Guard-issued agent credentials.
- Implement daily budget, model allow-list, per-request ceiling, and kill-switch rules.
- Use stable reason codes such as `AGENT_DISABLED`, `MODEL_NOT_ALLOWED`,
  `DAILY_BUDGET_EXCEEDED`, and `REQUEST_LIMIT_EXCEEDED`.
- Add atomic budget reservations for concurrent requests.
- Define UTC day rollover behavior and clock-skew handling.
- Emit policy-change ledger events.

Exit checks:

- Disabled agents are blocked before upstream network access.
- A model outside the allow-list is blocked with a stable error response.
- Concurrent requests cannot reserve more than the remaining budget.
- UTC rollover resets the daily accounting without deleting ledger history.

### Phase 3 - Orbio key lifecycle

**Goal:** manage provider keys without exposing them to individual agents.

Implementation:

- Implement MCP and manual-key adapters behind `OrbioClient`.
- Import, create, inspect, assign, rotate, and revoke keys.
- Display only key fingerprints in the CLI and dashboard.
- Build a rotation state machine with idempotency and recovery:
  `active -> rotating -> active` or `active -> rotating -> error`.
- Do not revoke the old key until the new key is confirmed usable.
- Serialize rotation per managed key to prevent double creation/revocation.
- Add deterministic mismatch detection: a key assigned to one agent but observed through
  another authenticated Guard identity produces an incident and blocks the request.

Exit checks:

- Repeated rotate commands do not create uncontrolled key churn.
- Failure to create/verify a new key leaves the previous valid key available.
- Successful rotation prevents further use of the previous key.
- Revoked and errored keys are never selected for new traffic.

### Phase 4 - OpenAI-compatible proxy

**Goal:** enforce policy on real model traffic.

Implementation:

- Start with the smallest required compatibility surface, preferably
  `POST /v1/chat/completions` and non-streaming responses.
- Authenticate agents with Guard-issued credentials, not raw Orbio keys.
- Validate request content type, body size, model, timeout, and supported parameters.
- Inject the selected Orbio key only into the upstream request.
- Preserve compatible upstream status codes and response bodies where safe.
- Add request IDs, timeouts, cancellation handling, and bounded retries for retry-safe
  failures only.
- Parse provider usage metadata and reconcile budget reservations.
- Bind to `127.0.0.1` by default and require explicit opt-in for remote access.
- Add streaming only after reservation/reconciliation behavior is tested.

Exit checks:

- A standard OpenAI SDK can call the local base URL successfully.
- Unauthorized agents receive `401`; policy failures receive `403` or `429` with stable
  Guard reason codes.
- Upstream failure releases the reservation exactly once.
- Client cancellation does not leave permanent reserved spend.
- Logs and error responses never expose the upstream key.

### Phase 5 - CLI setup and operator workflows

**Goal:** make installation and daily operation understandable without editing JSON.

Required commands:

```text
orbio-guard init
orbio-guard auth
orbio-guard status
orbio-guard serve
orbio-guard agent add|list|pause|resume|disable|rotate-token
orbio-guard policy set|show
orbio-guard key import|list|status|rotate|revoke
orbio-guard setup codex|claude|cursor
orbio-guard doctor
orbio-guard demo
```

Implementation:

- `init` creates validated local configuration and an initial administrator workflow.
- `setup` prints or safely applies the minimal base URL and credential configuration for
  each supported agent tool.
- `doctor` checks runtime version, port availability, state permissions, MCP session,
  key validity, chain RPC, and upstream reachability.
- Destructive operations require clear confirmation unless `--yes` is passed.
- Commands support human-readable output and `--json` for scripts.

Exit checks:

- A new user can initialize, add an agent, assign policy, and make a request using only
  documented commands.
- Re-running setup is idempotent and does not duplicate configuration.
- `doctor` distinguishes warnings, recoverable failures, and blocking failures.

### Phase 6 - Chain status and dashboard

**Goal:** show credible, live proof that Guard is operating on Orbio rails.

Implementation:

- Read the configured wallet's ORBIO balance through a public Robinhood Chain RPC.
- Keep contract addresses and chain metadata in explicit validated configuration until
  confirmed from an official source.
- Show wallet balance, holder-floor status, estimated accrual, managed keys, agent
  budgets, spend, policy state, and ledger activity.
- Label estimated accrual clearly and show its formula/source assumptions.
- Add a live demo mode that highlights policy block and rotation events.
- Follow the paper/ink design system without cloning Orbio's layout.
- Never send keys, session tokens, or unredacted configuration to the browser.

Exit checks:

- Empty, loading, offline, and error states are designed and readable.
- Dashboard totals agree with the ledger and budget service.
- Mobile and desktop layouts remain usable.
- Browser network payloads contain no secrets.

### Phase 7 - Demo automation and resilience

**Goal:** make the judging demonstration repeatable rather than improvised.

Implementation:

- Create two demo agents with distinct credentials and budgets.
- Run concurrent requests through the real proxy.
- Force one agent through the 80% alert and 100% enforcement threshold.
- Trigger a deterministic key mismatch/rotation scenario.
- Show continued service for the unaffected agent.
- Add a mock-provider mode so the demo can still show policy behavior if Orbio or model
  infrastructure is temporarily unavailable.
- Produce reset and seed commands that restore a clean demo state.

Exit checks:

- The complete scripted demo finishes in under two minutes.
- The demo can be repeated three times from a clean state without manual repair.
- Real mode and mock mode are visibly labeled.
- No step requires revealing a secret on screen.

### Phase 8 - Release and submission

**Goal:** publish a credible, reviewable hackathon submission.

Implementation:

- Write installation, quick-start, architecture, security, limitations, and demo guides.
- Add a concise threat model and disclosure of local-only/MVP constraints.
- Record a pitch video of at most three minutes and a technical walkthrough of at most
  three minutes.
- Deploy the public landing/demo dashboard or provide exact local run instructions.
- Ensure the repository is public before the Build Week deadline.
- Verify all claims against actual product behavior and current Orbio documentation.

Exit checks:

- A reviewer can understand the value proposition in 30 seconds.
- A technical reviewer can reproduce the main flow from a clean checkout.
- No secrets, private wallet data, local paths, or test credentials exist in Git.
- License, screenshots, demo URL, videos, and known limitations are present.

## 8. Test strategy

### Unit tests

Test pure domain behavior without network or filesystem dependencies:

- Budget remaining, reservation, confirmation, release, and UTC rollover.
- Concurrent reservation ordering and insufficient-budget failures.
- Model allow-list exact matching and pattern rules.
- Agent pause/disable behavior.
- Request cost estimation and provider-usage reconciliation.
- Rotation state transitions and idempotency.
- Key fingerprinting and redaction.
- Accrual estimate calculations and rounding.
- Configuration schema defaults and invalid values.

### Integration tests

Use a temporary state directory and mock HTTP/MCP servers:

- CLI commands persist and reload agents, policies, and keys.
- Proxy authenticates an agent and forwards a valid request.
- Proxy blocks invalid agent, model, budget, and request size.
- Upstream success confirms spend; failure/cancellation releases reservations.
- Rotation creates, verifies, swaps, and revokes in the correct order.
- State remains consistent after a simulated process interruption.
- Dashboard API returns redacted, internally consistent data.

### Contract tests

Run against sanitized fixtures and, when explicitly enabled, the live Orbio MCP:

- Tool discovery and schema parsing.
- Authentication expiry and reauthentication.
- Balance and key-status response parsing.
- Create/rotate/revoke success, denial, invalid-key, and rate-limit errors.
- Unknown fields are tolerated; missing required fields fail clearly.

Live contract tests must be opt-in, use a dedicated test key/account where possible, and
never run automatically in normal CI.

### End-to-end tests

- Initialize Guard from an empty state directory.
- Add two agents and configure policies.
- Start proxy and dashboard.
- Send SDK requests from both agents.
- Reach budget threshold and verify enforcement in HTTP response, state, and dashboard.
- Rotate a key and verify old/new behavior.
- Restart the process and confirm state recovery.

### Security tests

- Search logs, snapshots, fixtures, and browser payloads for seeded secret values.
- Attempt missing, malformed, reused, expired, and revoked credentials.
- Verify local-only binding and explicit remote-listen opt-in.
- Test oversized JSON, unsupported content types, slow clients, and upstream timeouts.
- Test path traversal and unsafe file permission scenarios around local state.
- Verify error messages do not include request prompts, responses, keys, cookies, or
  authorization headers.
- Run dependency audit and secret scanning before release.

### Manual UX checks

- Complete onboarding from a clean machine/user state.
- Verify keyboard navigation, focus states, contrast, responsive layout, and readable
  error messages.
- Verify dashboard loading, no-data, degraded-provider, and offline states.
- Confirm dangerous operations clearly identify the affected agent/key.
- Rehearse the complete demo while screen recording.

## 9. Required quality gates

Run narrow checks while developing and the complete gate before every demo/release.

```bash
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run build
npm run test:e2e
npm audit --audit-level=high
```

Release is blocked if:

- Any critical-path test fails.
- Type checking, production build, or secret scanning fails.
- A seeded key appears in logs, fixtures, UI data, or snapshots.
- Budget enforcement can be bypassed by concurrency, restart, or request cancellation.
- Rotation can revoke the only verified working key.
- The demo depends on undocumented manual state changes.

## 10. Guides to write with the implementation

Create these documents inside `03_implementation/orbio-guard/` as their features land:

- `README.md`: product summary, install, quick start, commands, screenshots, demo.
- `docs/architecture.md`: modules, request flow, persistence, and trust boundaries.
- `docs/orbio-integration.md`: MCP discovery, auth flow, tool schemas, and fallback.
- `docs/configuration.md`: every setting, default, environment variable, and example.
- `docs/agent-setup.md`: Codex, Claude, Cursor, and generic OpenAI SDK setup.
- `docs/security.md`: threat model, secret handling, logging policy, and limitations.
- `docs/testing.md`: local, mock, live-contract, end-to-end, and release commands.
- `docs/demo.md`: seed, run, reset, fallback, narration, and expected screen states.
- `docs/troubleshooting.md`: auth expiry, key failure, port conflict, corrupt state, RPC
  failure, and budget mismatch recovery.

Documentation is part of each phase's definition of done, not a final-day task.

## 11. Suggested seven-day schedule

### Day 1 - Truth and skeleton

- Complete Phase 0 MCP discovery.
- Scaffold the project and configuration.
- Establish sanitized fixtures and CI-quality local checks.

### Day 2 - Control core

- Implement agents, policies, budgets, reservations, and unit tests.
- Implement local persistence and redaction tests.

### Day 3 - Real traffic

- Implement Orbio/manual key adapters and the minimum proxy endpoint.
- Complete the first real SDK request through Guard.

### Day 4 - Rotation and CLI

- Complete key lifecycle, mismatch detection, operator commands, and integration tests.
- Record an internal vertical-slice demo.

### Day 5 - Dashboard

- Build wallet, agent, key, budget, and activity views.
- Add chain status and clearly labeled accrual estimates.

### Day 6 - Hardening and rehearsal

- Complete end-to-end/security checks and mock-provider fallback.
- Rehearse and tighten the two-minute demo.

### Day 7 - Publish

- Freeze features early.
- Run the full release gate, remove secrets, finish documentation, publish the repository
  and live page, and record the final pitch and technical walkthrough.

## 12. Immediate next actions

1. Validate the live Orbio MCP schemas and authentication behavior.
2. Decide the minimum proxy endpoint and whether streaming is required for the demo.
3. Scaffold `03_implementation/orbio-guard/` with TypeScript and tests.
4. Implement agent identity plus atomic budget reservations before any UI work.
5. Complete one real request through the proxy, then build rotation and dashboard views
   around that proven vertical slice.
