# Orbio.so — verified facts (read from the live site, 2026-09-06)

Everything below was retrieved directly from `orbio.so`, `holders.orbio.so`,
`orbio.so/build` and `orbio.so/orbio-build-week.pdf`. **Verified** unless marked.

## Build Week
- Live page: https://orbio.so/build
- **7 days · 10 winners · 8M $ORBIO (~$80,000 at current price).**
- Tagline: *"Build an agent on your key."* — "$100 of inference on us, +20% boost on your holder credits."
- Prizes: 1st 2M · 2nd 1.2M · 3rd 800K · 4th–10th share 4M. **Vested over 7 days, streamed every 4 hours.**
- **"Seven days. Ten winners. No rules."** — no published judging rubric; judges' call is final; one entry per person; **projects public by day 7**.
- Referral: 100K $ORBIO per referred builder who places top 10 (cap 1M).
- Timeline: Apply 3 days → Build 7 → Judging 3 → Prizes vest 7 (~20 days total).
- Starter kit: https://github.com/aster2709/orbio-starter · OpenRouter docs link provided.
- Official brief PDF (downloaded → `01_assets/orbio-build-week.pdf`).
- **Approved builders listed on-site include `@subvaultng`** (approved 5 Sept 15:13 UTC) plus ~35 others.
- Grants are *promotional credits, not an investment return, not redeemable for cash.*

## Earning mechanics (holders.orbio.so)
- 1.5% fee on every $ORBIO trade (both directions).
- 50% of collected fees → **OpenRouter credits**, distributed **hourly** to wallets holding ≥1,000 $ORBIO.
- Holders claim OpenRouter keys; keys spend the live balance at the gateway ("nothing to top up").
- Net ≈ 0.75% of traded volume reaches holders as spendable credits.
- Eligibility: wallets ≥1,000 $ORBIO; EIP-7702 smart accounts earn; plain contracts don't.
- FAQ stresses: not an investment return, credits are product-access grants.

## Orbio MCP (holders.orbio.so/mcp) — the key primitive for our build
- Public HTTP MCP endpoint: **`https://www.orbio.so/api/mcp`**
- Connect: `claude mcp add --transport http --scope user orbio https://www.orbio.so/api/mcp` then `/mcp` → Authenticate (browser 401 sign-in). `--scope user` = credits belong to the account, not one repo.
- **Five tools:**
  1. `orbio_get_balance` — credits accrued
  2. `orbio_create_key` — creates a key that spends balance live
  3. `orbio_get_key_status` — live spend/quota per key
  4. `orbio_create_key` (rotate) — new secret; old key stops in the same statement
  5. `orbio_revoke_key` — kills a key on the next request; balance untouched
- Orbio ships new features daily during Build Week; "all of it is yours."

## Keys
- Keys work with: Claude, GPT, Gemini, open weights, image/video, web search, PDF/audio, voice, sandboxed shell, structured outputs, Claude Code & Codex.
- No "$200/key" statement was found on-site (research note earlier claimed a cap — treat spend ceiling as "balance is the quota").

## Ecosystem / chain
- $ORBIO is a **Pons launch** on **Robinhood Chain** (chain id 4663 in Orbio's own UI).
- Pons = Robinhood Chain native launchpad (ponsfamily.com / docs.ponsfamily.com) — fixed-supply into Uniswap V3/WETH, 1% fee. Pons has run no hackathons of its own.
- Robinhood Chain mainnet went live 1 Jul 2026 (Arbitrum L2); builder programs routed via Arbitrum Open House.

## Source URLs (all accessed 2026-09-06)
- https://orbio.so/build
- https://orbio.so/orbio-build-week.pdf
- https://holders.orbio.so (earn mechanics)
- https://holders.orbio.so/mcp
- https://www.orbio.so (home)
- https://www.orbio.so/leaderboard
- https://orbio.so/build/apply
