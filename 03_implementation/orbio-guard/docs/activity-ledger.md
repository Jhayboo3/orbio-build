# Metadata-only activity ledger

Guard stores operational events in `~/.orbio-guard/guard.json` alongside agent and
budget state.

```bash
npm run dev -- activity
npm run dev -- activity --limit 100 --json
```

## Recorded events

- Agent creation, status changes, token rotation, and policy updates.
- Budget reservation, spend confirmation, and reservation release.
- Stale reservation recovery with the chosen confirm/release reason code.
- Allowed and blocked requests with model and stable reason code.
- Upstream errors with HTTP status or timeout reason.
- Key import, creation, rotation, and revocation with fingerprint only.

## Data intentionally excluded

- Prompts and model responses.
- Raw Guard agent tokens.
- Raw Orbio keys and OAuth tokens.
- Authorization headers and cookies.
- Complete upstream request or response bodies.

Request events use a Guard-generated request ID. The proxy returns it in the
`x-orbio-guard-request-id` header so an operator can correlate an HTTP response with
ledger metadata.

## Current persistence behavior

- Ledger writes use the same serialized, atomic state update path as budgets.
- Events are returned newest first.
- The MVP does not yet prune or archive old events.
- One Guard process may write to a state directory at a time.
