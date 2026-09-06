# Security policy

Updated: 2026-09-06

## Security model

Orbio Guard is a local-first MVP that protects one account-level Orbio key behind
separate Guard agent identities, policy checks, atomic budget reservations, and a
metadata-only ledger.

The current release is intended for one trusted operator on one machine or a
localhost-only container deployment. It is not a hardened public multi-tenant service.

## Secret handling

- OAuth state is stored in `~/.orbio-guard/oauth.json` with owner-only permissions.
- The upstream Orbio key is stored in `~/.orbio-guard/upstream.json` with owner-only
  permissions.
- Guard agent tokens are displayed once; only SHA-256 hashes are persisted.
- Key creation writes an owner-only recovery file before parsing and deletes it after a
  successful key-vault write.
- Logs, dashboard APIs, tests, and ledger events exclude raw credentials, authorization
  headers, cookies, prompts, and model responses.

## Network boundary

- Native execution binds to `127.0.0.1` by default.
- Docker listens on `0.0.0.0` inside the container, but Compose publishes both ports to
  host loopback only.
- Do not expose port `4318` directly to the internet.
- Remote deployment requires TLS, network authentication, rate limiting, and a reviewed
  secret manager before use.

## Budget recovery

State writes use atomic rename plus a file lock shared across processes. Reservations
older than the configured TTL are recovered when the proxy starts.

The default `confirm` recovery policy charges the full reservation to the local budget.
This is conservative: after a crash, Guard assumes the upstream provider may have
processed the request. Operators may choose `release`, but that can undercount spend.

## Known limitations

- Provider billing and local ledger state are not transactionally linked.
- Crash recovery cannot prove whether an interrupted upstream request was billed.
- Ledger retention and archival are not implemented.
- OAuth and key files use filesystem permissions rather than an operating-system
  keychain or cloud secret manager.
- Cursor custom-base-URL support varies by installed version.
- Live Orbio inference remains blocked for the connected account until it has spendable
  credit.

## Reporting

Do not file a public issue containing keys, OAuth tokens, wallet-private information, or
request content. Report security concerns privately to the repository owner with steps
to reproduce and sanitized logs.
