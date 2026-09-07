# Orbio Guard technical walkthrough - target 2 minutes 30 seconds

Updated: 2026-09-07

## 0:00-0:25 - Tenant boundary

> Cloudflare Access verifies the user. Guard derives a keyed tenant locator and routes
> that identity to one private SQLite-backed Durable Object. The original owner remains
> on the primary object; every new user receives isolated agents, budgets, activity, and
> an Orbio connection.

Show the technical request path and `docs/multi-tenancy.md`.

## 0:25-0:55 - Connect Orbio

> Connect Orbio dynamically registers an OAuth client, uses authorization code plus PKCE,
> validates tenant-bound state on a dedicated callback hostname, and encrypts OAuth tokens
> with AES-GCM. Refresh tokens are rotated before expiry.

> Provisioning calls Orbio MCP for key status and creation. If an account already has a
> key, Guard stops and requires a second explicit confirmation because replacement
> invalidates other consumers.

## 0:55-1:25 - Request enforcement

> Agent tokens contain a non-secret tenant locator and random secret; only the complete
> hash is stored. The Durable Object validates status, provider-qualified model policy,
> request ceiling, and remaining UTC daily budget before reserving integer micro-dollars.
> Tenant credentials are decrypted only after authorization succeeds.

Show the policy controls and metadata activity.

## 1:25-1:50 - Agent compatibility

> Guard supports Chat Completions, Anthropic Messages, and the Responses API. Orbio's live
> catalog currently exposes 430 models. Codex uses native metadata slug `gpt-5.6-sol`;
> Guard maps it to `openai/gpt-5.6-sol` and translates text and function-tool events to
> Orbio's available Chat Completions route.

Show a sanitized Codex text and `pwd` tool round trip.

## 1:50-2:12 - Reconciliation and recovery

> Buffered or streamed provider usage replaces the reservation with actual cost. Unpriced
> failures release it. Interrupted reservations are conservatively confirmed after five
> minutes because Orbio may have processed the request. The ledger contains IDs, model,
> decision, cost, and timestamps, never prompt or response content.

## 2:12-2:30 - Verification

> The release gate covers 69 automated tests, strict Node and Worker typechecking,
> desktop and mobile rendering, production builds, dependency audit, and GitHub Actions.
> Live verification covers OAuth registration, model catalog, key lifecycle, Codex text
> and tools, cost reconciliation, tenant isolation, Access enforcement, and Cloudflare
> deployment.

End on the public live-proof strip and repository.
