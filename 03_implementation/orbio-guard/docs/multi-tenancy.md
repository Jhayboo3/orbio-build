# Multi-tenant Orbio Guard

## Tenant identity

Cloudflare Access authenticates the browser. Guard normalizes the verified email and
derives a tenant locator with HMAC-SHA-256 using the Worker encryption secret. Raw email
hashes are not used as Durable Object names.

The original deployment owner maps to the existing `primary` object so its agents,
budgets, and ledger survive migration. Every other identity maps to a separate SQLite-
backed Durable Object.

## Orbio connection

New tenants connect through OAuth authorization code + PKCE:

```text
guard.larkvine.org
  -> www.orbio.so/mcp/authorize
  -> auth.guard.larkvine.org/orbio/callback
  -> tenant Durable Object
```

The callback hostname exposes only the exact GET callback route. OAuth state includes the
non-secret tenant locator and a random nonce; the complete value and PKCE verifier must
match values stored in that tenant object.

OAuth tokens and generated gateway keys are encrypted with AES-256-GCM before Durable
Object storage. Access tokens are refreshed before expiry. The encryption key is a
Cloudflare Worker secret and must also exist in an operator-controlled recovery store.

## Inference routing

New tokens use:

```text
og_agent_<tenant-locator>.<random-secret>
```

The locator routes the request to one Durable Object. Authorization still hashes and
compares the entire token. A locator does not grant access and contains no email or secret.
Legacy unscoped tokens route to `primary`.

Tenant credentials are loaded only after token, status, model, request-limit, and daily-
budget authorization succeeds. One tenant cannot list, mutate, or spend another tenant's
state or key.

## Existing Orbio keys

Orbio exposes one active gateway key per account and does not reveal an existing secret.
If a newly connected account already has a key, Guard stops and explains that provisioning
requires replacement. Rotation proceeds only after a second explicit confirmation because
it permanently invalidates the old key for other consumers.

## Access policy

Self-service onboarding requires the `Orbio Guard operator` Access application to allow
any authenticated email. Access remains deny-by-default for unauthenticated traffic, and
the Worker independently validates JWT signature, issuer, audience, and email before
selecting a tenant.
