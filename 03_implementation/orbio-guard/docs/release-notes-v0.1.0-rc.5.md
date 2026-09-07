# Orbio Guard v0.1.0-rc.5

Prepared: 2026-09-07

## Product

- Multi-tenant Orbio connection through dynamic OAuth registration, authorization code +
  PKCE, tenant-bound state, token refresh, and a dedicated HTTPS callback.
- One private Durable Object per authenticated Access identity, with keyed tenant locators
  and backward-compatible preservation of the original `primary` tenant.
- AES-GCM encryption for per-tenant OAuth tokens and gateway keys.
- Access-protected operator controls for agent creation, status, archival, and one-time
  token presentation.

## Agent compatibility

- Responses-to-Chat adaptation for Codex text and function-tool turns.
- Native Codex model slug mapping to provider-qualified Orbio IDs.
- Authenticated `/v1/models` proxy for the live Orbio catalog.
- Beginner setup for terminal, Codex, Claude Code, Cursor, VS Code, JetBrains, JavaScript,
  Python, macOS Keychain, Linux, and PowerShell.

## Build Week presentation

- Contest-facing public story centered on Connect Orbio, tenant isolation, real Codex,
  pre-key-access enforcement, and provider-cost reconciliation.
- Sanitized public terminal proof and live-evidence strip.
- Updated architecture, security, pitch, technical walkthrough, and submission guides.
- Regenerated responsive screenshots and narrated pitch/technical videos.

## Verification

- 69 automated tests with strict Node and Worker typechecking.
- Desktop and mobile rendering with no browser errors or overflow.
- Zero dependency vulnerabilities.
- Authenticated Orbio catalog returned 430 models.
- Codex Doctor passed all 22 checks; live GPT-5.6 Sol text and shell-tool turns completed.
- Primary-tenant migration, cross-tenant isolation, encrypted credential round trips, and
  OAuth authorization parameters verified.
- Pitch video: 92.5 seconds, H.264/AAC.
- Technical video: 112 seconds, H.264/AAC.
