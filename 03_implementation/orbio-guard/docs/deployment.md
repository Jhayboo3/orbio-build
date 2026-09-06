# Deployment guide

Updated: 2026-09-06

## Native production run

```bash
npm ci
npm run build
npm run release:check
node dist/cli.js serve
```

Health endpoints:

- `/healthz` confirms the local process is serving.
- `/readyz` returns `200` only when the upstream key vault is configured.

## Docker build

```bash
docker build -t orbio-guard:local .
```

The image uses Node.js 24, runs as the unprivileged `node` user, includes a health
check, and stores state in `/home/node/.orbio-guard`.

The built image has been smoke-tested with an empty state volume: `/healthz` returns
`200`, `/readyz` returns `503` until a key is configured, the dashboard loads, and the
state directory remains owned by the non-root `node` user.

## Docker Compose

```bash
docker compose build
docker compose run --service-ports guard node dist/cli.js auth --no-open
docker compose run --service-ports guard node dist/cli.js key create --label "Orbio Guard container"
docker compose run guard node dist/cli.js agent add \
  --name "Container agent" \
  --daily-budget 5 \
  --models "openai/*,anthropic/*"
docker compose up -d
```

For `auth --no-open`, copy the printed authorization URL into the host browser. Compose
maps callback port `4319` to host loopback while the container listener binds internally
to `0.0.0.0`.

The Compose configuration uses a named volume and publishes dashboard/proxy port `4318`
only on `127.0.0.1`.

## Health verification

```bash
curl http://127.0.0.1:4318/healthz
curl http://127.0.0.1:4318/readyz
```

## Crash recovery

On startup, Guard recovers reservations older than
`ORBIO_GUARD_RESERVATION_TTL_MS` (default five minutes).

```bash
export ORBIO_GUARD_STALE_RESERVATION_POLICY=confirm
node dist/cli.js budget recover
```

Use `confirm` for fail-closed budget accounting. `release` is intended only for an
operator who has independently verified that interrupted requests were not billed.

## Public deployment warning

The supplied container is for reproducible localhost operation and judging. It does not
make Guard safe as an internet-facing service. Add TLS, authenticated operator access,
network restrictions, rate limiting, durable locking/storage, secret management, and
monitoring before remote deployment.
