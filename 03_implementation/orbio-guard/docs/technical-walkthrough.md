# Technical walkthrough script - under three minutes

Updated: 2026-09-06

Target length: approximately 2 minutes 40 seconds.

## 0:00-0:25 - Architecture

> Agent tools call one local endpoint using separate Guard tokens. The proxy resolves the
> identity, evaluates policy, reserves spend, and only then loads the account-level Orbio
> key. The upstream key never reaches Codex, Claude Code, Cursor, or an application SDK.

Show `docs/architecture.md`.

## 0:25-0:55 - Orbio integration

> Guard discovers Orbio's protected-resource and authorization-server metadata, performs
> authorization code plus PKCE, dynamically registers the client, stores refresh tokens
> with owner-only permissions, and reconnects without prompting. The authenticated MCP
> runtime currently exposes balance, key status, create, revoke, and legacy-key delete.

Show `orbio-guard status` and `orbio-guard key status` without revealing raw state files.

## 0:55-1:25 - Request enforcement

> Every request receives a Guard request ID. Agent status, model patterns, per-request
> ceiling, and UTC daily budget are checked before forwarding. Reservations are integer
> micro-dollars and serialized across processes, preventing concurrent requests from
> racing past the limit.

Show the authorizer and budget tests.

## 1:25-1:55 - Protocols and reconciliation

> The same control path supports Chat Completions, Responses, and Anthropic Messages.
> Buffered responses read usage cost directly. SSE streams are forwarded while Guard
> watches final events and confirms cost before closing the downstream stream. Unpriced
> failures release their reservation.

Show the protocol integration tests.

## 1:55-2:20 - Secrets and recovery

> Key creation writes the MCP result to an owner-only recovery file before parsing. The
> result is removed only after the secret reaches the vault. State writes use a lock and
> atomic rename. On restart, stale reservations are confirmed by default because an
> interrupted upstream request may still have been billed.

Show `SECURITY.md` and the recovery tests.

## 2:20-2:40 - Verification

> The release gate runs type checking, 67 automated tests, desktop and mobile Chromium
> rendering, dependency audit, and Docker build. The container runs as a non-root user
> and exposes health and key-aware readiness endpoints. The same gate passes in GitHub
> Actions.

End on the dashboard and repository status.
