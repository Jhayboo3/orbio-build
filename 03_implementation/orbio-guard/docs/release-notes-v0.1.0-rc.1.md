# Orbio Guard v0.1.0-rc.1

Release candidate date: September 6, 2026

## Summary

Orbio Guard is a local-first control plane for safely sharing one Orbio account across
multiple AI agents. It keeps the account gateway key behind a local vault while each
agent receives an independent identity, budget, model policy, and kill switch.

## Judge-ready paths

- Run the deterministic demo: `npm run dev -- demo --hold`.
- Run the release gate: `npm run release:check`.
- Open the narrated pitch: `docs/assets/orbio-guard-pitch-draft.mp4`.
- Open the technical walkthrough: `docs/assets/orbio-guard-technical-draft.mp4`.
- Review architecture: `docs/architecture.md`.
- Review security: `SECURITY.md`.
- Review submission limitations: `docs/submission.md`.

## Verification summary

- 53 automated tests pass.
- Desktop/mobile browser rendering passes without console errors or horizontal overflow.
- Dependency audit reports zero vulnerabilities.
- Docker image builds and runs as the non-root `node` user.
- GitHub Actions runs the release gate and Docker build successfully.

## Live Orbio status

- OAuth authorization and refresh storage are verified.
- Authenticated tool discovery and read-only balance/key status are verified.
- MCP-backed key creation is verified and stored with owner-only permissions.
- A live proxy request reached the canonical authenticated gateway.
- The request returned `402 insufficient_quota` because the connected account has no
  spendable credit.

## Before public submission

1. Add or claim spendable Orbio credit and capture one successful live model response.
2. Decide whether to keep the synthetic narration or replace it with the builder's voice.
3. Change the GitHub repository from private to public deliberately.
4. Confirm every date, prize statement, and Orbio tool contract against the live site.
5. Create the final public release from this candidate tag.
