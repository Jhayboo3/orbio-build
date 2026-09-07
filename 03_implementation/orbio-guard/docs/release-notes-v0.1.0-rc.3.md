# Orbio Guard v0.1.0-rc.3

Prepared: 2026-09-07

## Added

- Guarded migration of remaining legacy OpenRouter-key credit into the current Orbio
  account balance.
- Post-migration verification of legacy-key disablement and the expected spendable
  balance increase.
- Metadata-only `LEGACY_KEY_DELETED` audit events.

## Live verification

- Explicit account-key rotation replaced a stale local vault copy after an operator
  ownership decision.
- The replacement remained in the owner-only vault; output and audit records contained
  only its fingerprint.
- A temporary agent limited to `openai/gpt-4o-mini`, `$0.05` per request, and `$0.05` per
  UTC day completed a live request through Guard with HTTP 200.
- Guard reconciled the provider-reported cost as `$0.000007` and disabled the temporary
  agent immediately after the request.

## Release verification

- 57 automated unit and integration tests.
- Strict TypeScript checking and production build.
- Desktop and mobile Chromium rendering checks.
- High-severity dependency audit.

## Remaining launch actions

- Live key revoke remains intentionally unexecuted because it would stop the active key.
- Repository visibility and GitHub release publication remain deliberate operator actions.
