# Cloudflare Pages deployment

The Cloudflare deployment is the public Orbio Guard product site and synthetic dashboard
demo. It deliberately does not contain an Orbio key, OAuth credentials, Guard agent
tokens, wallet data, or the live inference proxy.

Production site: <https://orbio-guard.pages.dev>

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
