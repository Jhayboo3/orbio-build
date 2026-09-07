# Orbio Build Week submission checklist

Updated: 2026-09-07

## Positioning

**Connect Orbio. Control every agent.**

Orbio Guard is a multi-tenant control plane for Orbio-powered agents. Users connect their
own Orbio account, then issue separate agent identities with enforceable budgets, model
policies, kill switches, and metadata-only auditing. OAuth tokens and gateway keys remain
encrypted per tenant.

## Submission links

- Public product and proof: `https://orbio-guard.pages.dev`
- Beginner onboarding: `https://orbio-guard.pages.dev/getting-started/`
- Access-protected app: `https://guard.larkvine.org/dashboard/`
- Inference health: `https://api.guard.larkvine.org/readyz`
- Repository: `https://github.com/Jhayboo3/orbio-build`
- Current release: `https://github.com/Jhayboo3/orbio-build/releases/tag/v0.1.0-rc.6`

## Judge demo

1. Show the public problem and live-proof strip.
2. Explain Access login → Connect Orbio → PKCE callback → encrypted tenant vault.
3. Create an agent with model and budget policy without exposing its token.
4. Show live Codex on `gpt-5.6-sol` using provider `orbio_guard`.
5. Run a harmless tool such as `pwd` and show the final response.
6. Run the deterministic two-agent demo and show Beta receive
   `429 DAILY_BUDGET_EXCEEDED` before upstream access.
7. Show Alpha continue and show metadata-only activity/cost reconciliation.

## Proof to state explicitly

- 430 models returned by the authenticated Orbio catalog.
- Live GPT-5.6 Sol inference through Guard and Orbio.
- Live Codex text and shell-tool round trips.
- Provider-reported spend reconciliation.
- Orbio OAuth dynamic registration and HTTPS callback acceptance.
- One encrypted Durable Object tenant per authenticated user.
- 73 automated tests and zero dependency vulnerabilities.
- No prompts, responses, raw keys, or tokens in the audit ledger.

## Required artifacts

- Public repository and live URL.
- Product pitch no longer than three minutes.
- Technical walkthrough no longer than three minutes.
- Architecture diagram and sanitized screenshots.
- Installation, security, deployment, onboarding, models, and limitations documentation.

## Release gate

```bash
npm run release:check
npm run submission:check
git status --short
```

Require a clean tagged repository, passing CI, zero high-severity audit findings, valid
media duration, and no credentials in tracked files.

## Honest limitations

- Public dashboard data is synthetic; live tenant data is protected by Cloudflare Access.
- Cursor custom-provider support varies by installed version.
- Live account-key revoke remains intentionally unexecuted because it stops that account.
- Stale reservation recovery is conservative and cannot independently prove provider
  billing after an interrupted request.
- The Responses-to-Chat Codex adapter supports text and function tools; not every future
  Responses API modality is guaranteed.
