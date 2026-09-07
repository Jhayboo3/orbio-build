# Orbio Guard

**Connect Orbio. Control every agent.**

Orbio Guard is a multi-tenant control plane for text and tool-using AI agents powered by
Orbio. Users connect their own Orbio account, then issue separate agent identities with
hard admission budgets, model policies, request ceilings, kill switches, and metadata-
only auditing. OAuth tokens and gateway keys remain encrypted per tenant.

[Live product](https://orbio-guard.pages.dev) ·
[Access-protected app](https://guard.larkvine.org/dashboard/) ·
[Developer setup](https://orbio-guard.pages.dev/getting-started/) ·
[v0.1.0-rc.6](https://github.com/Jhayboo3/orbio-build/releases/tag/v0.1.0-rc.6)

![Orbio Guard](03_implementation/orbio-guard/docs/assets/landing-desktop.png)

## Why

One shared model key gives every agent access to the same account balance. Guard adds the
operational layer needed for fleets:

- Separate one-time, hashed credentials per agent.
- Model allow-lists, pause/disable controls, and token rotation.
- Catalog-priced worst-case reservations bounded by output tokens.
- UTC daily budgets and per-request ceilings serialized in Durable Objects.
- Provider-cost reconciliation and conservative crash recovery.
- No prompts, model responses, authorization headers, or raw credentials in the ledger.

## How It Works

```text
Cloudflare Access user
  -> isolated tenant Durable Object
  -> encrypted Orbio OAuth tokens and gateway key
  -> controlled Guard agents

Codex / Claude Code / SDK
  -> Guard agent token
  -> status + model + hard request/daily admission bound
  -> Orbio gateway
  -> actual cost reconciliation
```

Guard dynamically registers an Orbio OAuth client and uses authorization code + PKCE.
Each verified user maps to a private tenant. Agent tokens carry a non-secret tenant
locator for routing while authorization compares the complete token hash.

## Live Evidence

- 430 models returned by the authenticated Orbio catalog.
- GPT-5.6 Sol inference through Guard and Orbio.
- Codex text and shell-tool round trips through the Responses adapter.
- Cloudflare Access enforcement and direct Worker bypass rejection.
- Cross-tenant isolation and AES-GCM credential encryption.
- 73 automated tests, responsive browser checks, and zero dependency vulnerabilities.

## Repository

The application lives in [`03_implementation/orbio-guard`](03_implementation/orbio-guard).

```bash
cd 03_implementation/orbio-guard
npm ci
npm run release:check
```

Key documentation:

- [Architecture](03_implementation/orbio-guard/docs/architecture.md)
- [Multi-tenancy](03_implementation/orbio-guard/docs/multi-tenancy.md)
- [Security](03_implementation/orbio-guard/SECURITY.md)
- [Developer setup](03_implementation/orbio-guard/docs/agent-setup.md)
- [Model selection](03_implementation/orbio-guard/docs/models.md)
- [Build Week submission](03_implementation/orbio-guard/docs/submission.md)

## Build Week Videos

- [92.5-second product pitch](03_implementation/orbio-guard/docs/assets/orbio-guard-pitch-draft.mp4)
- [112-second technical walkthrough](03_implementation/orbio-guard/docs/assets/orbio-guard-technical-draft.mp4)

Public dashboard data is synthetic and labeled. Live tenant data is protected by
Cloudflare Access. Guard currently hard-bounds text and function-tool requests; image,
audio, and video inputs fail closed until modality-aware pricing is implemented.
