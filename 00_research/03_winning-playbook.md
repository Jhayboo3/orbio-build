# Winning playbook for Orbio Guard (Build Week)

Ranked, practical recommendations for the Orbio.so Build Week.

1. **Position as credit/payments infrastructure for agents, not an "agent app."**
   Orbio gives every builder the same self-funding MCP loop. The unmet need is
   **control at fleet/team level**: one wallet, many agents/repos/teammates, budgets,
   per-agent limits, audit, no shared secrets, leak-safe rotation.

2. **Demo-first.** Film (or live-run) a 1–2 min vertical slice by mid-week:
   two agents racing on one wallet → one trips its budget → guard kills it →
   agent calls `orbio_create_key` and self-heals. Show real spend metrics.

3. **Verifiable on-chain usage.** Public dashboard page with wallet ORBIO balance,
   floor status, accrual/hour, spend and key rotations — "on-chain engagement" is what
   similar judges rewarded (and it proves the project isn't a shell).

4. **Tie to Orbio's flywheel.** Everything must make Orbio credits/keys/MCP more usable
   and drive spend through their gateway. Mention credit liquidity & key reuse across
   OpenRouter models.

5. **Security/trust angle as the differentiator.** No-logging relay, per-agent keys,
   auto-rotation on detected sharing, instant revoke via MCP. ~35 other builders will
   demo the MCP; almost none will show enforced, audited multi-agent control.

6. **Ship the artifacts judges parse:**
   - ≤3-min pitch video
   - ≤3-min technical walkthrough (rotation, budgets, no-logging)
   - polished "paper & ink" UI in Orbio's design family
   - repo + live URL public before day 7

7. **Public momentum during the week:** post progress in the builders' channel and on X
   (`@subvaultng` is already on the approved list); visible engagement signals.

8. **Avoid:** shell demos, over-scoped infra with no demo, cloned-agent novelty, any
   "token price / investment" framing (credits are promotional grants), or missing the
   day-7 public deadline.
