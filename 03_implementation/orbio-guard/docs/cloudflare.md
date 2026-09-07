# Cloudflare deployment

The Cloudflare deployment is the public Orbio Guard product site and synthetic dashboard
demo. It deliberately does not contain an Orbio key, OAuth credentials, Guard agent
tokens, wallet data, or the live inference proxy.

Production site: <https://orbio-guard.pages.dev>

## Full live Worker

The live runtime uses two hostnames:

- `guard.larkvine.org` serves the operator UI and admin API behind Cloudflare Access.
- `api.guard.larkvine.org` serves health checks and `/v1/*` inference routes authenticated
  with per-agent Guard tokens.

`GuardCoordinator`, a SQLite-backed Durable Object, serializes agent status, model
policies, UTC daily budgets, reservations, spend reconciliation, and the metadata-only
ledger. The Orbio gateway key is stored as an encrypted Worker secret. It is never placed
in Durable Object state, static assets, logs, or source control.

```bash
npm run cloudflare:live:dev
npm run cloudflare:live:deploy
```

Required production configuration:

- `ORBIO_GUARD_UPSTREAM_KEY`: encrypted Worker secret.
- `ACCESS_TEAM_DOMAIN`: Cloudflare Access team URL.
- `ACCESS_AUD`: Access application audience tag.

Current Access application:

- Team domain: `https://proud-term-65c0.cloudflareaccess.com`
- Audience: `563dec62cb94746a7402a2bb4104ba97967be129ac72f0ccbae11a8e344e0dba`
- Protected hostname: `guard.larkvine.org`

Create a self-hosted Cloudflare Access application for `guard.larkvine.org`, add an Allow
policy for the operator identity, then copy its team domain and audience tag into the
Worker variables. The Worker independently verifies every Access JWT against Cloudflare's
rotating JWKS; merely reaching the custom domain is not sufficient authorization.

The optional `BOOTSTRAP_TOKEN` secret exists only while provisioning the first agent. It
must be deleted immediately after bootstrap, leaving Access JWT validation as the only
operator authentication path.

Create agents with `POST /api/admin/agents` after signing in through Access. The response
contains the `og_agent_...` token once; only its SHA-256 hash is persisted.

The inference hostname is intentionally not behind interactive Access because SDKs send
Guard bearer tokens rather than browser cookies. It exposes only `/healthz`, `/readyz`,
and the three `/v1/*` proxy routes. Operator and dashboard APIs return `404` there.

## Verified deployment

The full runtime was deployed and live-tested on 2026-09-07:

- `api.guard.larkvine.org/readyz` returned ready with the encrypted upstream secret.
- A temporary agent limited to `openai/gpt-4o-mini` and `$0.05` per request/day completed
  a real inference request with HTTP 200 and a provider response ID.
- The Durable Object reconciled the request and the agent was disabled immediately.
- The temporary bootstrap secret was deleted; only `ORBIO_GUARD_UPSTREAM_KEY` remains.
- Cloudflare Access redirects unauthenticated operator requests and direct `workers.dev`
  bypass attempts fail with `403 ACCESS_REQUIRED`.
- The persistent `Cloudflare primary agent` is limited to `$5` per UTC day and `$0.50`
  per request for `openai/*` and `anthropic/*`. Its one-time token is stored in macOS
  Keychain under service `orbio-guard-cloudflare-agent`; only its hash is in Durable
  Object state.

Nested custom-domain DNS may remain negatively cached by a workstation resolver shortly
after first deployment. Cloudflare authoritative DNS and `1.1.1.1` should be used to
distinguish propagation from a Worker routing failure.

The credential-bearing runtime uses Node HTTP, owner-only filesystem storage, and file
locking. Moving that runtime to an internet-facing Worker requires a separate security
design with authenticated operator access, Cloudflare-managed secrets, Durable Objects or
D1 transactional state, abuse controls, and reconciliation semantics. The Pages adapter
therefore keeps the shipped local security boundary intact.

## Local preview

```bash
npm ci
npm run cloudflare:dev
```

Wrangler prints a local URL. Verify `/`, `/dashboard/`, `/technical/`, and
`/api/dashboard`.

## Deploy

Authenticate Wrangler once if needed:

```bash
npx wrangler login
```

Deploy the production Pages project:

```bash
npm run cloudflare:deploy
```

The first deployment creates or connects the `orbio-guard` Pages project. Cloudflare
prints the deployment URL. No runtime secrets are required or permitted for this adapter.

## Git integration

For automatic Pages builds from GitHub, configure:

- Repository: `Jhayboo3/orbio-build`
- Root directory: `03_implementation/orbio-guard`
- Build command: `npm run build:cloudflare`
- Build output directory: `cloudflare/dist`

Pages Functions are discovered from `functions/`. Keep the Pages root directory at
`03_implementation/orbio-guard` so both the build script and synthetic dashboard function
are available to Cloudflare.
