# Dashboard

Start Guard and open the local dashboard:

```bash
npm run dev -- serve
```

- Landing page: `http://127.0.0.1:4318/`
- Guard dashboard: `http://127.0.0.1:4318/dashboard`
- Secret-safe JSON snapshot: `http://127.0.0.1:4318/api/dashboard`

## Views

- Live Orbio balance and masked connected-wallet identifiers.
- Guard agent totals, status, model policy, daily budget, confirmed spend, and
  reservations.
- Local upstream-key fingerprint and remote account-key status.
- Metadata-only activity stream with request, budget, policy, key, and upstream events.
- A concise control-loop panel for the hackathon demonstration.

## Refresh behavior

- Local Guard state refreshes every four seconds.
- Orbio MCP balance/key status refreshes every sixty seconds.
- Remote refresh is non-interactive. If OAuth is missing or expired beyond automatic
  refresh, the dashboard reports the remote state as unavailable and instructs the
  operator to run `orbio-guard auth`; it never opens a browser from an API request.

## Privacy boundary

The dashboard API does not return:

- Raw Guard agent tokens or their complete hashes.
- Raw Orbio gateway keys or OAuth tokens.
- Prompts, model responses, authorization headers, or cookies.
- Complete wallet addresses; wallet identifiers are masked before serialization.

The page includes a restrictive Content Security Policy and is served from the same
loopback origin as the proxy.

## Visual language

The UI uses the Orbio-inspired warm paper canvas, near-black ink, bronze orb treatment,
hairline borders, editorial display type, small monospace labels, generous whitespace,
and a restrained neon status accent. It is an ecosystem homage rather than a clone.

## Verification

```bash
npm run test:ui
```

The Playwright check builds the app, launches Chromium, renders landing/dashboard views
at desktop and mobile widths, asserts agent rendering, detects horizontal overflow, and
fails on browser console or page errors.
