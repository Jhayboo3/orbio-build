# Build Week submission checklist

Updated: 2026-09-06

## Positioning

**One wallet. Many agents. Safe spend.**

Orbio Guard is a local credit-control plane that keeps the account gateway key private
while separate agents receive identities, budgets, model rules, kill switches, and a
metadata-only audit trail.

## Demo checklist

- Run `npm run dev -- demo --hold`.
- Show Alpha and Beta as separate Guard agents.
- Show Beta succeed once, then receive `429 DAILY_BUDGET_EXCEEDED`.
- Show Alpha continue successfully.
- Show the budget and activity changes on the dashboard.
- State clearly that demo mode uses a mock upstream and no Orbio credit.
- Separately show authenticated Orbio balance/key status and the live-created key
  fingerprint without exposing credentials.

## Technical walkthrough checklist

- OAuth discovery, authorization code + PKCE, refresh storage, and non-interactive
  dashboard refresh.
- One account-level Orbio key behind Guard agent credentials.
- File permissions, atomic key recovery, state locking, and stale reservation recovery.
- Chat Completions, Responses, Anthropic Messages, and SSE cost reconciliation.
- Metadata-only ledger and dashboard API privacy tests.
- Canonical gateway-host handling that preserves authorization headers.

## Required artifacts

- Public repository before the Build Week deadline. The repository is currently private
  by operator request and must be changed deliberately before submission.
- Live or reproducible localhost dashboard.
- Pitch video no longer than three minutes.
- Technical walkthrough no longer than three minutes.
- Architecture diagram and synthetic screenshots. These are now available under
  `docs/architecture.md` and `docs/assets/`.
- Installation, deployment, security, demo, limitations, and troubleshooting docs.

Timed scripts are ready in `docs/pitch-script.md` and
`docs/technical-walkthrough.md`. A verified silent H.264 screen-capture draft is
available at `docs/assets/orbio-guard-demo.mp4`. A 27-second synthetic narrated H.264/AAC
draft is available at `docs/assets/orbio-guard-demo-narrated.mp4`.

Submission-length synthetic narrated drafts are also ready:

- `docs/assets/orbio-guard-pitch-draft.mp4` - 77.6-second product pitch.
- `docs/assets/orbio-guard-technical-draft.mp4` - 1-minute 43.6-second technical
  walkthrough.

Personal re-narration remains optional if the builder wants their own voice.

## Release gate

```bash
npm run release:check
docker build -t orbio-guard:release .
git status --short
```

Require a clean repository, passing tests, zero high-severity audit findings, successful
desktop/mobile rendering, and no credentials in tracked files.

## Honest limitations to disclose

- The connected account currently has no spendable Orbio credit, so the live gateway
  returns `402 insufficient_quota` for inference requests.
- Live key creation is verified; live rotation and revoke are intentionally unexecuted.
- Cursor setup is guided rather than automatically applied.
- Crash recovery confirms or releases stale reservations but cannot prove provider
  billing outcome.
- The container is localhost-oriented, not a public multi-tenant deployment.
