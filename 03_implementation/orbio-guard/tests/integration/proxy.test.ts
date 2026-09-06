import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { GuardConfig } from "../../src/config/schema.js";
import { GuardControlService } from "../../src/control/service.js";
import { BudgetService } from "../../src/domain/budget.js";
import { startProxyServer, type ProxyRuntime } from "../../src/proxy/server.js";
import { GuardStateStore } from "../../src/state/store.js";
import { UpstreamKeyStore } from "../../src/upstream/key-store.js";

describe("OpenAI-compatible proxy", () => {
  const runtimes: ProxyRuntime[] = [];
  const upstreamServers: Server[] = [];

  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
    await Promise.all(upstreamServers.splice(0).map(closeServer));
  });

  it("isolates the upstream key, forwards the request, and enforces confirmed spend", async () => {
    let upstreamCalls = 0;
    let receivedAuthorization = "";
    const upstream = await startUpstream((request, response) => {
      upstreamCalls += 1;
      receivedAuthorization = request.headers.authorization ?? "";
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          id: "generation-test",
          choices: [{ message: { role: "assistant", content: "ok" } }],
          usage: { prompt_tokens: 4, completion_tokens: 1, cost: 0.2 },
        }),
      );
    });
    upstreamServers.push(upstream.server);
    const setup = await setupProxy(upstream.baseUrl, {
      dailyBudgetMicroUsd: "300000",
      defaultReservationMicroUsd: "200000",
    });
    runtimes.push(setup.runtime);

    const first = await sendChat(setup.proxyUrl, setup.agentToken, "first prompt");
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ id: "generation-test" });
    expect(receivedAuthorization).toBe("Bearer or-test-upstream-secret");

    const second = await sendChat(setup.proxyUrl, setup.agentToken, "second prompt");
    expect(second.status).toBe(429);
    await expect(second.json()).resolves.toMatchObject({
      error: { code: "DAILY_BUDGET_EXCEEDED" },
    });
    expect(upstreamCalls).toBe(1);

    const usage = await setup.budgets.usage(setup.agentId);
    expect(usage).toMatchObject({
      confirmedMicroUsd: "200000",
      reservedMicroUsd: "0",
    });
    const persistedState = await readFile(
      join(setup.stateDirectory, "guard.json"),
      "utf8",
    );
    expect(persistedState).not.toContain("first prompt");
    expect(persistedState).not.toContain("or-test-upstream-secret");
    expect(JSON.parse(persistedState).ledger.map((event: { type: string }) => event.type)).toEqual(
      expect.arrayContaining([
        "AGENT_CREATED",
        "BUDGET_RESERVED",
        "REQUEST_ALLOWED",
        "SPEND_CONFIRMED",
        "REQUEST_BLOCKED",
      ]),
    );
  });

  it("rejects invalid Guard tokens and streaming before upstream access", async () => {
    let upstreamCalls = 0;
    const upstream = await startUpstream((_request, response) => {
      upstreamCalls += 1;
      response.end(JSON.stringify({ choices: [], usage: { cost: 0 } }));
    });
    upstreamServers.push(upstream.server);
    const setup = await setupProxy(upstream.baseUrl);
    runtimes.push(setup.runtime);

    const unauthorized = await sendChat(setup.proxyUrl, "invalid", "prompt");
    expect(unauthorized.status).toBe(401);

    const streaming = await fetch(`${setup.proxyUrl}/v1/chat/completions`, {
      body: JSON.stringify({
        model: "openai/gpt-test",
        messages: [{ role: "user", content: "prompt" }],
        stream: true,
      }),
      headers: {
        authorization: `Bearer ${setup.agentToken}`,
        "content-type": "application/json",
      },
      method: "POST",
    });
    expect(streaming.status).toBe(400);
    await expect(streaming.json()).resolves.toMatchObject({
      error: { code: "STREAMING_NOT_SUPPORTED" },
    });
    expect(upstreamCalls).toBe(0);
  });

  it("releases reservations after an unpriced upstream failure", async () => {
    let upstreamCalls = 0;
    const upstream = await startUpstream((_request, response) => {
      upstreamCalls += 1;
      response.setHeader("content-type", "application/json");
      if (upstreamCalls === 1) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: { message: "temporary" } }));
        return;
      }
      response.end(
        JSON.stringify({ choices: [], usage: { cost: 0.1 } }),
      );
    });
    upstreamServers.push(upstream.server);
    const setup = await setupProxy(upstream.baseUrl, {
      dailyBudgetMicroUsd: "200000",
      defaultReservationMicroUsd: "200000",
    });
    runtimes.push(setup.runtime);

    expect((await sendChat(setup.proxyUrl, setup.agentToken, "first")).status).toBe(500);
    expect((await setup.budgets.usage(setup.agentId)).reservedMicroUsd).toBe("0");

    expect((await sendChat(setup.proxyUrl, setup.agentToken, "second")).status).toBe(200);
    expect(upstreamCalls).toBe(2);
  });

  it("rejects oversized bodies before upstream access", async () => {
    let upstreamCalls = 0;
    const upstream = await startUpstream((_request, response) => {
      upstreamCalls += 1;
      response.end(JSON.stringify({ choices: [], usage: { cost: 0 } }));
    });
    upstreamServers.push(upstream.server);
    const setup = await setupProxy(upstream.baseUrl, { maxBodyBytes: 128 });
    runtimes.push(setup.runtime);

    const response = await sendChat(
      setup.proxyUrl,
      setup.agentToken,
      "x".repeat(512),
    );
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "BODY_TOO_LARGE" },
    });
    expect(upstreamCalls).toBe(0);
  });

  it("releases the reservation when the upstream request times out", async () => {
    const upstream = await startUpstream(() => undefined);
    upstreamServers.push(upstream.server);
    const setup = await setupProxy(upstream.baseUrl, {
      requestTimeoutMs: 50,
    });
    runtimes.push(setup.runtime);

    const response = await sendChat(setup.proxyUrl, setup.agentToken, "timeout");
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "UPSTREAM_TIMEOUT" },
    });
    expect((await setup.budgets.usage(setup.agentId)).reservedMicroUsd).toBe("0");
  });
});

async function setupProxy(
  upstreamBaseUrl: URL,
  overrides: {
    dailyBudgetMicroUsd?: string;
    defaultReservationMicroUsd?: string;
    maxBodyBytes?: number;
    requestTimeoutMs?: number;
  } = {},
) {
  const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-proxy-"));
  const store = new GuardStateStore(stateDirectory);
  const control = new GuardControlService(store);
  const created = await control.addAgent({
    allowedModels: ["openai/*"],
    dailyBudgetMicroUsd: overrides.dailyBudgetMicroUsd ?? "1000000",
    name: "Proxy test agent",
  });
  await new UpstreamKeyStore(stateDirectory).save(
    "or-test-upstream-secret",
    upstreamBaseUrl,
  );
  const config: GuardConfig = {
    defaultReservationMicroUsd:
      overrides.defaultReservationMicroUsd ?? "250000",
    host: "127.0.0.1",
    maxBodyBytes: overrides.maxBodyBytes ?? 1_048_576,
    mcpEndpoint: new URL("https://www.orbio.so/api/mcp"),
    oauthCallbackPort: 4319,
    oauthTimeoutMs: 180_000,
    port: 0,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 2_000,
    stateDirectory,
    upstreamBaseUrl,
  };
  const runtime = await startProxyServer(config);
  const address = runtime.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Proxy did not bind to a TCP port.");
  }

  return {
    agentId: created.agent.id,
    agentToken: created.token,
    budgets: new BudgetService(store),
    proxyUrl: `http://127.0.0.1:${address.port}`,
    runtime,
    stateDirectory,
  };
}

async function sendChat(url: string, token: string, prompt: string) {
  return fetch(`${url}/v1/chat/completions`, {
    body: JSON.stringify({
      model: "openai/gpt-test",
      messages: [{ role: "user", content: prompt }],
    }),
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
}

async function startUpstream(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
): Promise<{ baseUrl: URL; server: Server }> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock upstream did not bind to a TCP port.");
  }
  return {
    baseUrl: new URL(`http://127.0.0.1:${address.port}/v1`),
    server,
  };
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
