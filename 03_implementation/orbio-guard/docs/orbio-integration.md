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

## Current documented tool contract

The live documentation lists six tools:

1. `orbio_get_balance`
2. `orbio_claim_credits`
3. `orbio_create_key`
4. `orbio_top_up_key`
5. `orbio_rotate_key`
6. `orbio_delete_key`

This supersedes the earlier research note that described five tools and represented
rotation as another `orbio_create_key` call.

## Confirmed unauthenticated behavior

An MCP `initialize` request without a token returns HTTP `401` with a
`WWW-Authenticate` bearer challenge, the `orbio:credits` scope, and the protected
resource metadata URL. This is the expected starting point for standards-based MCP
OAuth discovery.

## Still requiring authenticated capture

- Exact JSON schemas returned by `tools/list`.
- Exact result payloads for all six tools.
- Key identifiers accepted by top-up, rotate, and delete.
- Rotation failure and rollback behavior.
- Token expiry and refresh behavior in a real session.
- Whether key status/spend can be attributed to a Guard agent without one key per agent.

Do not create production parsing logic for these fields until sanitized authenticated
fixtures have been captured.
