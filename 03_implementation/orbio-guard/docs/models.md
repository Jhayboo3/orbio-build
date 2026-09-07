# Orbio model selection

The authenticated Orbio gateway exposed 430 models on 2026-09-07. Model availability is
dynamic, so applications should treat the live endpoint as authoritative:

```bash
curl https://api.guard.larkvine.org/v1/models \
  -H "Authorization: Bearer $ORBIO_GUARD_AGENT_TOKEN"
```

Guard proxies this request to Orbio without persisting the catalog or exposing the
upstream key.

The selected defaults were confirmed directly from that response:

- `openai/gpt-5.6-sol`: 1,050,000-token context.
- `anthropic/claude-sonnet-5`: 1,000,000-token context.
- `openai/gpt-4o-mini`: 128,000-token context.

## Recommended defaults

| Client | Configure this model | Orbio receives | Reason |
| --- | --- | --- | --- |
| Codex | `gpt-5.6-sol` | `openai/gpt-5.6-sol` | Present in both catalogs; Codex has built-in 272k-context metadata. |
| OpenAI-compatible SDK | `openai/gpt-5.6-sol` | Same | Provider-qualified Orbio model ID. |
| Claude Code | `anthropic/claude-sonnet-5` | Same | Current Sonnet model in the live Orbio catalog. |
| Low-cost smoke test | `openai/gpt-4o-mini` | Same | Live-tested, but current Codex lacks native metadata for it. |

## Codex model names

Codex and Orbio use different naming conventions for the same model:

```text
Codex metadata slug: gpt-5.6-sol
Orbio gateway ID:    openai/gpt-5.6-sol
```

Use the unqualified slug in `~/.codex/config.toml`. Guard qualifies native Codex slugs
with `openai/` before policy evaluation and forwarding. Using `openai/gpt-4o-mini`
directly in Codex works for inference but triggers fallback model metadata and can produce
incorrect context or tool assumptions.

## Policy alignment

The agent's allowed model policy is evaluated against the provider-qualified Orbio ID.
For the recommended Codex model, allow either:

```text
openai/gpt-5.6-sol
```

or a deliberate family wildcard:

```text
openai/*
```

Do not copy model IDs from old examples without checking `/v1/models`. Batch, free,
image, audio, and preview variants may have different capabilities and pricing.
