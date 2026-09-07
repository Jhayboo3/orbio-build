# Orbio Guard v0.1.0-rc.4

Prepared: 2026-09-07

## Cloudflare deployment

- Public product site and synthetic dashboard: <https://orbio-guard.pages.dev>
- Access-protected live operator dashboard: <https://guard.larkvine.org>
- Token-authenticated inference API: <https://api.guard.larkvine.org>
- SQLite-backed Durable Object serializes agents, policies, UTC daily budgets,
  reservations, spend reconciliation, and metadata-only activity.
- Static assets and dynamic APIs apply explicit content and framing security headers.

## Security

- Cloudflare Access restricts the operator hostname to the configured owner identity.
- The Worker independently validates Access JWT signature, issuer, and audience.
- Direct `workers.dev` attempts fail with `403 ACCESS_REQUIRED`.
- The public inference hostname exposes only health, readiness, and `/v1/*` proxy routes.
- The Orbio gateway key is stored only as an encrypted Worker secret.
- Per-agent tokens are shown once and persisted only as SHA-256 hashes.
- Temporary bootstrap access was deleted after provisioning.

## Live verification

- A temporary tightly limited agent completed `openai/gpt-4o-mini` inference through the
  Worker and Durable Object path with HTTP 200, then was disabled immediately.
- The persistent cloud agent also completed a live HTTP 200 inference request.
- The persistent token is stored in macOS Keychain rather than a repository file.

## Release verification

- 61 automated unit and integration tests.
- Local runtime and Cloudflare Worker type checking.
- Production Node and Cloudflare static builds.
- Desktop and mobile Chromium rendering checks.
- Zero dependency vulnerabilities.
- GitHub Actions validation passed for the Cloudflare runtime commits.
