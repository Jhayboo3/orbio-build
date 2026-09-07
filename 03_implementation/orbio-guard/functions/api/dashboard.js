const DEMO_AGENT = {
  allowedModels: ["openai/gpt-*", "anthropic/claude-*"],
  budgetPercent: 18,
  confirmedUsd: 0.91,
  dailyBudgetUsd: 5,
  id: "cloudflare-demo-agent",
  maxRequestUsd: 0.5,
  name: "Cloudflare demo agent",
  project: "public showcase",
  reservedUsd: 0,
  status: "active",
  tokenFingerprint: "demo-only",
};

export function onRequestGet() {
  const generatedAt = new Date().toISOString();
  const activity = [
    event("REQUEST_ALLOWED", generatedAt, {
      agentId: DEMO_AGENT.id,
      amountMicroUsd: "70000",
      model: "openai/gpt-4o-mini",
    }),
    event("SPEND_CONFIRMED", new Date(Date.now() - 25_000).toISOString(), {
      agentId: DEMO_AGENT.id,
      amountMicroUsd: "7",
    }),
    event("KEY_ROTATED", new Date(Date.now() - 70_000).toISOString()),
  ];

  return Response.json(
    {
      activity,
      agents: [DEMO_AGENT],
      generatedAt,
      key: {
        configured: true,
        fingerprint: "demo-fingerprint",
        remoteHasKey: true,
        remoteLastUsedAt: new Date(Date.now() - 25_000).toISOString(),
        remotePrefix: "sk-orbio-demo",
      },
      mode: "demo",
      remote: {
        balanceUsd: 24.09,
        wallets: ["0x1234...cdef"],
      },
      summary: {
        activeAgents: 1,
        confirmedTodayUsd: 0.91,
        disabledAgents: 0,
        reservedTodayUsd: 0,
        totalAgents: 1,
      },
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=()",
        "referrer-policy": "no-referrer",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      },
    },
  );
}

export function onRequest() {
  return Response.json(
    { error: { code: "METHOD_NOT_ALLOWED", message: "Use GET." } },
    {
      headers: {
        allow: "GET",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
        "x-content-type-options": "nosniff",
      },
      status: 405,
    },
  );
}

function event(type, timestamp, details = {}) {
  return {
    id: `${type.toLowerCase()}-${timestamp}`,
    timestamp,
    type,
    ...details,
  };
}
