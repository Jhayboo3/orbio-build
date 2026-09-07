# Security policy

Updated: 2026-09-07

## Security model

Orbio Guard protects Orbio account keys behind separate agent identities, policy checks,
atomic budget reservations, and a metadata-only ledger.

The Cloudflare runtime is multi-tenant: Access identity maps to one isolated Durable
Object, and OAuth tokens plus gateway keys are encrypted with AES-GCM before storage. The
Node and container runtime remains localhost-oriented.

## Secret handling

- OAuth state is stored in `~/.orbio-guard/oauth.json` with owner-only permissions.
- The upstream Orbio key is stored in `~/.orbio-guard/upstream.json` with owner-only
  permissions.
- Guard agent tokens are displayed once; only SHA-256 hashes are persisted.
- Key creation writes an owner-only recovery file before parsing and deletes it after a
  successful key-vault write.
- Logs, dashboard APIs, tests, and ledger events exclude raw credentials, authorization
  headers, cookies, prompts, and model responses.
- Cloud tenants store encrypted OAuth tokens and gateway keys; the encryption key is a
  Worker secret backed up separately in the operator's secure recovery store.

## Network boundary

- Native execution binds to `127.0.0.1` by default.
- Docker listens on `0.0.0.0` inside the container, but Compose publishes both ports to
  host loopback only.
- Do not expose port `4318` directly to the internet.
- Cloud deployment uses TLS, Cloudflare Access, origin checks, tenant-scoped tokens,
  Durable Objects, and Worker secrets.

## Budget recovery

State writes use atomic rename plus a file lock shared across processes. Reservations
older than the configured TTL are recovered when the proxy starts.

The default `confirm` recovery policy charges the full reservation to the local budget.
This is conservative: after a crash, Guard assumes the upstream provider may have
processed the request. Operators may choose `release`, but that can undercount spend.

## Known limitations

- Provider billing and Guard ledger state are not transactionally linked.
- Crash recovery cannot prove whether an interrupted upstream request was billed.
- Ledger retention and archival are not implemented.
- Local OAuth and key files use filesystem permissions; cloud tenant credentials use
  AES-GCM encryption and Worker secrets.
- Cursor custom-base-URL support varies by installed version.
- The Codex adapter targets text and function tools; future Responses modalities may
  require additional protocol translation.

## Reporting

Do not file a public issue containing keys, OAuth tokens, wallet-private information, or
request content. Report security concerns privately to the repository owner with steps
to reproduce and sanitized logs.
