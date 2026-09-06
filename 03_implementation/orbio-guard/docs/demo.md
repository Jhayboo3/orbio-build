# Two-agent demo

Run the deterministic demonstration without using Orbio credits:

```bash
npm run dev -- demo
```

Keep the seeded dashboard running for a recording:

```bash
npm run dev -- demo --hold
```

## Scripted sequence

1. **Alpha research** sends a request and confirms `$0.10` of mock spend.
2. **Beta coding** sends a request and confirms `$0.15` of mock spend.
3. Beta attempts another `$0.15` reservation against its `$0.20` daily limit and Guard
   returns `429 DAILY_BUDGET_EXCEEDED` before the mock upstream is called.
4. Alpha sends another request successfully, proving one agent's policy trip does not
   stop the rest of the fleet.
5. The dashboard shows both agents, confirmed spend, the blocked decision, and the
   metadata-only activity sequence.

The CLI and dashboard identify this as mock mode. No real provider call, key rotation,
wallet mutation, or Orbio credit spend occurs.

## Suggested narration

> One Orbio account funds the work, but every agent gets its own Guard identity and
> budget. Beta hits its limit, so Guard blocks it before the upstream key is touched.
> Alpha keeps running. Every decision is visible, and no prompt is stored.

## Reset behavior

Each run creates a new owner-only temporary state directory and deletes it when the demo
stops. Agent tokens and the synthetic upstream key never enter the repository.
