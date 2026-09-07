# Orbio Guard v0.1.0-rc.6

Prepared: 2026-09-07

## Enforcement

- Catalog-priced hard admission bounds using fixed-point pico-dollar arithmetic.
- Conservative input-token bound by UTF-8 bytes and the highest applicable model rate,
  including long-context overrides.
- Injected, bounded output limits with a 1,024-token default when a caller omits one.
- Requests fail closed for unpriced models and image/audio/video inputs until modality
  pricing is implemented.
- If provider-reported cost exceeds the calculated bound, the agent is disabled and a
  bound-violation event is recorded.
- Default per-request ceiling lowered to `$0.25` so GPT-5.6 Sol defaults are usable.

## Defense and operations

- Malformed agent tokens are rejected before any Durable Object lookup.
- Cloudflare rate-limit binding limits public inference to 120 requests/minute per token
  or anonymous source.
- Authenticated model catalog is cached for five minutes.
- Cloud agent token rotation replaces the stored hash and returns a one-time token.

## Presentation

- Public dashboard carries an explicit synthetic-data banner.
- Claims now scope Guard to text and function-tool agents and describe 430 models as
  Orbio coverage governed by Guard.
- Repository front door is a product README with live links, evidence, videos, and
  documentation.
- GitHub repository now has a description, homepage, and topics.

## Verification

- 73 automated tests with strict Node and Worker typechecking.
- Desktop and mobile rendering, production builds, and zero dependency vulnerabilities.
- Live boundary check: a 1,024-token request over a `$0.01` ceiling returned
  `429 REQUEST_LIMIT_EXCEEDED`; a malformed token returned `401`.
- Note: the promotional Orbio inference balance is currently exhausted; Orbio returned
  `402 insufficient_quota` for the allowed request. Claim or top up credit before
  recording live positive-cost demonstrations.
