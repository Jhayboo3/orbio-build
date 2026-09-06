import { createServer, type IncomingMessage, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { GuardConfig } from "../config/schema.js";
import { GuardControlService } from "../control/service.js";
import { LedgerService } from "../domain/ledger.js";
import { startProxyServer } from "../proxy/server.js";
import { GuardStateStore } from "../state/store.js";
import { UpstreamKeyStore } from "../upstream/key-store.js";

export interface DemoStep {
  agent: string;
  expected: string;
  status: number;
}

export interface DemoResult {
  activityTypes: string[];
  dashboardUrl: string;
  mode: "mock";
  steps: DemoStep[];
}

export interface MockDemoRuntime {
  close(): Promise<void>;
  dashboardUrl: string;
  run(): Promise<DemoResult>;
}

export async function createMockDemo(): Promise<MockDemoRuntime> {
  const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-guard-demo-"));
  const store = new GuardStateStore(stateDirectory);
  const control = new GuardControlService(store);
  const alpha = await control.addAgent({
    allowedModels: ["openai/demo-model"],
    dailyBudgetMicroUsd: "500000",
    maxRequestMicroUsd: "150000",
    name: "Alpha research",
    project: "demo",
  });
  const beta = await control.addAgent({
    allowedModels: ["openai/demo-model"],
    dailyBudgetMicroUsd: "200000",
    maxRequestMicroUsd: "150000",
    name: "Beta coding",
    project: "demo",
  });
  const upstream = await startDemoUpstream();
  await new UpstreamKeyStore(stateDirectory).save(
    "or-demo-upstream-key",
    upstream.baseUrl,
  );
  const config: GuardConfig = {
    defaultReservationMicroUsd: "150000",
    host: "127.0.0.1",
    maxBodyBytes: 1_048_576,
    mcpEndpoint: new URL("https://www.orbio.so/api/mcp"),
    oauthCallbackPort: 4319,
    oauthTimeoutMs: 180_000,
    port: 0,
    requestTimeoutMs: 5_000,
    stateDirectory,
    upstreamBaseUrl: upstream.baseUrl,
  };
  const proxy = await startProxyServer(config);
  const address = proxy.server.address();
  if (!address || typeof address === "string") {
    throw new Error("Demo proxy did not bind to a TCP port.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    dashboardUrl: `${baseUrl}/dashboard`,
    async run() {
      const steps = [
        await demoRequest(baseUrl, alpha.token, "alpha-one", "allowed"),
        await demoRequest(baseUrl, beta.token, "beta-one", "allowed"),
        await demoRequest(baseUrl, beta.token, "beta-two", "budget blocked"),
        await demoRequest(baseUrl, alpha.token, "alpha-two", "fleet continues"),
      ];
      const activity = await new LedgerService(store).list(30);
      return {
        activityTypes: activity.map((event) => event.type),
        dashboardUrl: `${baseUrl}/dashboard`,
        mode: "mock",
        steps,
      };
    },
    async close() {
      await proxy.close();
      await closeServer(upstream.server);
      await rm(stateDirectory, { force: true, recursive: true });
    },
  };
}

async function demoRequest(
  baseUrl: string,
  agentToken: string,
  marker: string,
  expected: string,
): Promise<DemoStep> {
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    body: JSON.stringify({
      model: "openai/demo-model",
      messages: [{ role: "user", content: marker }],
    }),
    headers: {
      authorization: `Bearer ${agentToken}`,
      "content-type": "application/json",
    },
    method: "POST",
  });
  return {
    agent: marker.startsWith("alpha") ? "Alpha research" : "Beta coding",
    expected,
    status: response.status,
  };
}

async function startDemoUpstream(): Promise<{ baseUrl: URL; server: Server }> {
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    const marker = JSON.parse(body).messages?.[0]?.content as string | undefined;
    const cost = marker?.startsWith("beta") ? 0.15 : 0.1;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: `demo-${marker ?? "request"}`,
        choices: [{ message: { role: "assistant", content: "ok" } }],
        usage: { prompt_tokens: 4, completion_tokens: 1, cost },
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Demo upstream did not bind to a TCP port.");
  }
  return {
    baseUrl: new URL(`http://127.0.0.1:${address.port}/v1`),
    server,
  };
}

async function readRequestBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
