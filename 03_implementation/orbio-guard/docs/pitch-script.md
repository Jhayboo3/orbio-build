# Orbio Guard pitch - target 2 minutes 10 seconds

Updated: 2026-09-07

## 0:00-0:18 - Problem

> Orbio gives one key access to every model. But when several agents share that key, one
> leaked credential or runaway loop can expose the entire balance. There is no identity,
> budget, model policy, kill switch, or attribution per agent.

Show the public landing hero and the one Orbio tenant connected to several agents.

## 0:18-0:40 - Product

> Orbio Guard is the multi-tenant control plane for Orbio-powered agents. Every user
> connects their own Orbio account through OAuth. Guard encrypts that tenant's tokens and
> gateway key, then issues separate agent identities with enforceable limits.

Show the Connect, Issue, Run section and the live-proof strip.

## 0:40-1:05 - Real agent

Show Codex configured with:

```text
model: gpt-5.6-sol
provider: orbio_guard
```

Ask Codex to run `pwd` and report the directory.

> This is real Codex calling GPT-5.6 Sol through Guard and Orbio. Guard translates the
> Responses protocol, supports function tools, and records only model and cost metadata.

## 1:05-1:35 - Enforcement

Show two synthetic demo agents sharing one protected account. Run the deterministic demo:

```bash
npm run dev -- demo --hold
```

> Both agents can work. Beta's second reservation crosses its daily budget, so Guard
> returns `429 DAILY_BUDGET_EXCEEDED` before the Orbio key is read. Alpha continues.
> One constrained agent cannot stop the fleet.

## 1:35-1:58 - Technical proof

Show the technical page and activity dashboard.

> Each Access identity maps to a private Durable Object. OAuth and gateway credentials
> are encrypted with AES-GCM. Budgets are serialized atomically, provider cost replaces
> each reservation, and prompts, responses, and raw credentials never enter the ledger.

Show the proof values: 430 live models, 69 automated tests, zero audit vulnerabilities.

## 1:58-2:10 - Orbio value

> Orbio provides the intelligence. Guard makes it safe to operate at fleet scale: more
> developers, more agents, and more controlled inference through Orbio without shared-key
> risk. Connect Orbio. Control every agent.

## Recording rules

- Never display an `og_agent_...`, OAuth token, Orbio key, or complete wallet address.
- Clearly label deterministic budget demonstrations as synthetic.
- Clearly label Codex and catalog evidence as live-verified.
- Keep the final video below three minutes.
