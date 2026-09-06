# Orbio MCP integration notes

Verified against the official Orbio documentation and endpoint on 2026-09-06.

## Endpoint

- MCP resource: `https://www.orbio.so/api/mcp`
- Documentation: `https://www.orbio.so/mcp`
- Transport: HTTP POST; GET returns `405 Method Not Allowed`.
- Required OAuth scope: `orbio:credits`.
- Bearer credentials are sent through the `Authorization` header.

## OAuth discovery

Protected resource metadata:

`https://www.orbio.so/.well-known/oauth-protected-resource/api/mcp`

Authorization server metadata:

`https://www.orbio.so/.well-known/oauth-authorization-server`

The current server advertises:

- Authorization code and refresh token grants.
- PKCE with `S256`.
- Dynamic client registration.
- Public clients with token endpoint authentication method `none`.
- Authorization endpoint: `https://www.orbio.so/mcp/authorize`.
- Token endpoint: `https://www.orbio.so/api/mcp/oauth/token`.
- Registration endpoint: `https://www.orbio.so/api/mcp/oauth/register`.
- Revocation endpoint: `https://www.orbio.so/api/mcp/oauth/revoke`.

## Public documentation contract

The public documentation currently lists six tools:

1. `orbio_get_balance`
2. `orbio_claim_credits`
3. `orbio_create_key`
4. `orbio_top_up_key`
5. `orbio_rotate_key`
6. `orbio_delete_key`

## Authenticated runtime contract

An authenticated `tools/list` call on 2026-09-06 returned five tools:

1. `orbio_get_balance` — no arguments; account balance is the quota.
2. `orbio_get_key_status` — no arguments; reports the single current account key and
   any legacy OpenRouter key.
3. `orbio_create_key` — optional `label` string; creates the account key and retires an
   existing key in the same statement, so it is also the rotation operation.
4. `orbio_revoke_key` — no arguments; stops the current Orbio key without changing the
   account balance.
5. `orbio_delete_key` — no arguments; permanently disables only a legacy OpenRouter key
   and returns its unused amount to the account balance.

The sanitized schema capture is stored at
`tests/fixtures/orbio-tools-list.json`. Runtime behavior takes precedence over the
public six-tool page until Orbio aligns the two surfaces.

This means Guard must multiplex its own per-agent credentials over one account-level
Orbio key. Orbio does not currently expose per-key budgets or multiple simultaneous
gateway keys for one account.

## Confirmed unauthenticated behavior

An MCP `initialize` request without a token returns HTTP `401` with a
`WWW-Authenticate` bearer challenge, the `orbio:credits` scope, and the protected
resource metadata URL. This is the expected starting point for standards-based MCP
OAuth discovery.

## Still requiring authenticated capture

- Sanitized result/error fixtures for revoke and legacy-key deletion.
- Live rotation and revocation behavior.
- Token expiry and refresh behavior in a real session.

## Read-only result schemas

Authenticated calls confirmed that both read-only tools return MCP text content and
`structuredContent`.

`orbio_get_balance` currently returns:

- `wallets`: connected wallet addresses.
- `accrued`, `purchased`, `spent`, `claimed`, and `balance`.
- Each money field contains numeric `usd` and integer-string `microUsd` values.

`orbio_get_key_status` currently returns:

- `hasKey`, visible `prefix`, `createdAt`, and `lastUsedAt`.
- `baseUrl` for gateway requests.
- Nullable `legacy` status with label, limit, usage, remaining amount, disabled state,
  and whether the legacy secret remains readable.

Repository fixtures use synthetic values; live wallet addresses and balances are not
committed.

## Live key creation result

The guarded `orbio_create_key` flow succeeded on 2026-09-06. Guard stored the returned
`sk-orbio-...` secret with owner-only permissions, confirmed `hasKey` through
`orbio_get_key_status`, removed its recovery file, and wrote only a fingerprint to the
ledger.

The key-status gateway URL redirects from the bare domain to `www`. Guard canonicalizes
the host before forwarding because authorization headers are not preserved across that
origin redirect.

A live proxy request subsequently reached the authenticated gateway and returned
`402 insufficient_quota`. This confirms routing and authentication but means a complete
model-response smoke test requires available Orbio account credit.

Do not create production parsing logic for these fields until sanitized authenticated
fixtures have been captured.

## Local OAuth implementation

`orbio-guard auth` uses the MCP TypeScript SDK's Streamable HTTP transport and OAuth
provider contract. It dynamically registers a public client, uses authorization code +
PKCE, opens the Orbio approval page, and receives the callback on
`http://127.0.0.1:4319/oauth/callback` by default.

Client registration, tokens, PKCE verifier, and OAuth state are stored in
`~/.orbio-guard/oauth.json` with owner-only directory/file permissions. Writes use a
temporary file followed by atomic rename. `orbio-guard logout` removes this local
credential state.
