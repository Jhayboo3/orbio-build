# Orbio key lifecycle

Guard owns the single account-level Orbio gateway key and never gives it to individual
agents. Agents authenticate to Guard with separate `og_agent_...` credentials.

## Create the account key

```bash
npm run dev -- key create --label "Orbio Guard local proxy"
```

The command:

1. Authenticates to the Orbio MCP using the saved OAuth session.
2. Calls `orbio_get_key_status`.
3. Refuses to continue if an account key already exists.
4. Calls `orbio_create_key`.
5. Writes the raw response to an owner-only recovery file before parsing.
6. Extracts and stores the key in `~/.orbio-guard/upstream.json`.
7. Deletes the recovery file only after the key vault write succeeds.
8. Records only a key fingerprint and event type in the activity ledger.

The live create flow was verified on 2026-09-06. The gateway key uses the
`sk-orbio-...` format; the complete value is never printed or committed.

## Rotate an existing key

```bash
npm run dev -- key create --rotate --label "Orbio Guard rotated"
```

Rotation is explicit because the runtime `orbio_create_key` operation retires the
existing account key in the same statement. Guard does not silently rotate during a
normal create command.

Live rotation has not yet been executed. The code path is covered with synthetic
fixtures and must be rehearsed only when replacing the current key is acceptable.

## Revoke the account key

```bash
npm run dev -- key revoke --yes
```

This calls `orbio_revoke_key`, removes the local upstream key after the MCP call
succeeds, and records `KEY_REVOKED`. It intentionally requires `--yes`.

Live revoke has not been executed because it would stop the current key.

## Manual fallback

If MCP key creation is unavailable, import a key without placing it in command history:

```bash
export ORBIO_GUARD_UPSTREAM_KEY="your-key"
npm run dev -- key import
unset ORBIO_GUARD_UPSTREAM_KEY
```

## Canonical gateway host

The authenticated key-status response reports `https://orbio.so/api/v1`, which sends a
`308` redirect to `https://www.orbio.so/api/v1`. Standard fetch behavior removes the
authorization header across that origin change. Guard normalizes the stored base URL to
the `www` host before forwarding requests.

## Recovery

If parsing or key-vault storage fails after Orbio returns a new secret, Guard leaves:

`~/.orbio-guard/key-create-recovery.json`

The file is owner-readable only. Treat it as a live credential response, recover or
rotate the key, then remove the file securely.
