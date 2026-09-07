# Troubleshooting

Updated: 2026-09-06

## OAuth browser does not open

Run:

```bash
npm run dev -- auth --no-open
```

Open the printed URL manually. Ensure callback port `4319` is available. In Docker, map
port `4319`, bind the callback listener to `0.0.0.0`, and keep the public callback host
as `127.0.0.1`.

## Dashboard says remote status unavailable

The dashboard never launches interactive OAuth. Run `orbio-guard auth` in a terminal,
then refresh. Check `~/.orbio-guard/oauth.json` exists with owner-only permissions.

## Gateway returns `missing_api_key`

Run `orbio-guard key status`. Guard canonicalizes `https://orbio.so/api/v1` to
`https://www.orbio.so/api/v1`; using the redirecting bare-domain origin directly can
strip the authorization header.

## Gateway returns `402 insufficient_quota`

Authentication and routing succeeded, but the Orbio account has no spendable credit.
Check `orbio-guard status` and fund or claim credit through the supported Orbio flow.

If `status` shows spendable balance `$0` but a legacy OpenRouter key still has remaining
credit, migrate it with `orbio-guard key migrate-legacy --yes`. This permanently disables
the old key and returns its remainder to the current Orbio balance.

## `/readyz` returns `503`

The proxy is running but no upstream key is configured. Use MCP-backed creation:

```bash
npm run dev -- key create --label "Orbio Guard"
```

Or import a manually claimed key through the environment-backed command.

## Agent receives `401 INVALID_AGENT_TOKEN`

The one-time Guard token is missing, malformed, or has been rotated. Rotate it again and
update the agent tool's environment or settings.

## Agent receives `403`

- `AGENT_PAUSED`: resume the agent.
- `AGENT_DISABLED`: explicitly resume only after reviewing the incident.
- `MODEL_NOT_ALLOWED`: update the allow-list or choose an approved model.

## Agent receives `429`

- `REQUEST_LIMIT_EXCEEDED`: reduce the request reservation or raise the per-request
  policy deliberately.
- `DAILY_BUDGET_EXCEEDED`: wait for UTC rollover or update the daily budget.

## Budget remains reserved after interruption

Guard automatically recovers reservations older than five minutes at startup. Run the
operator command manually when needed:

```bash
npm run dev -- budget recover
```

The default confirms stale reservations. Use `--policy release` only after independently
verifying the upstream request was not billed.

## State lock timeout

Do not manually delete a fresh `guard.json.lock`. Guard removes locks older than thirty
seconds. Confirm no other process is writing the same state directory, then retry.

## Container exits with a permission error

Use the supplied image and named volume. The image pre-creates
`/home/node/.orbio-guard` for the non-root `node` user. Custom bind mounts must be
writable by container UID/GID `1000` and should remain mode `0700`.

## Cursor cannot use the Guard base URL

Cursor's public API-key documentation does not guarantee a base-URL override in every
build. Use the guided settings only if the installed build exposes that field; otherwise
use Codex, Claude Code, or a standard OpenAI-compatible SDK.
