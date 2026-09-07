import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  activeCloudAgents,
  chatResponseToResponsesSse,
  decryptCloudValue,
  encryptCloudValue,
  evaluateCloudPolicy,
  extractCloudCostMicroUsd,
  extractCloudStreamCostMicroUsd,
  formatCloudUsd,
  latestCloudKeyUse,
  orbioModelId,
  responsesToChatRequest,
  tenantFromCloudAgentToken,
  validateCloudModelPatterns,
  type CloudAgent,
  type CloudAgentStatus,
  type CloudEncryptedValue,
} from "../../src/cloudflare/core.js";

interface Env {
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ASSETS: Fetcher;
  BOOTSTRAP_TOKEN?: string;
  GUARD: DurableObjectNamespace<GuardCoordinator>;
  ORBIO_GUARD_UPSTREAM_BASE_URL: string;
  ORBIO_GUARD_UPSTREAM_KEY: string;
  ORBIO_DATA_ENCRYPTION_KEY: string;
  PRIMARY_ACCESS_EMAIL: string;
}

interface TenantConnection {
  clientInformation?: Record<string, unknown>;
  encryptedGatewayKey?: EncryptedValue;
  encryptedTokens?: EncryptedValue;
  keyFingerprint?: string;
  oauthState?: string;
  pkceVerifier?: string;
  provisioningAttemptAt?: string;
}

type EncryptedValue = CloudEncryptedValue;

interface Reservation {
  agentId: string;
  amountMicroUsd: string;
  createdAt: string;
  id: string;
}

interface BudgetDay {
  agentId: string;
  confirmedMicroUsd: string;
  date: string;
  reservations: Reservation[];
}

interface LedgerEvent {
  agentId?: string;
  amountMicroUsd?: string;
  httpStatus?: number;
  id: string;
  model?: string;
  reasonCode?: string;
  requestId?: string;
  timestamp: string;
  type: string;
}

interface GuardState {
  agents: CloudAgent[];
  budgets: BudgetDay[];
  connection?: TenantConnection;
  ledger: LedgerEvent[];
}

interface AccessIdentity {
  email: string;
  tenantLocator: string;
}

const ROUTES = new Map([
  ["/v1/chat/completions", "chat/completions"],
  ["/v1/responses", "responses"],
  ["/v1/messages", "messages"],
]);
const ORBIO_OAUTH_CALLBACK = "https://auth.guard.larkvine.org/orbio/callback";

export class GuardCoordinator extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/authorize") {
        return Response.json(await this.authorize(await request.json()));
      }
      if (request.method === "POST" && url.pathname === "/authenticate") {
        const input = await request.json<{ token?: unknown }>();
        if (typeof input.token !== "string") throw new Error("Agent token is invalid.");
        const tokenHash = await sha256(input.token);
        const agent = (await this.read()).agents.find((candidate) =>
          safeEqual(candidate.tokenHash, tokenHash));
        if (!agent || agent.archivedAt || agent.status !== "active") {
          return guardError(401, "INVALID_AGENT_TOKEN", "The Guard agent token is invalid.");
        }
        return Response.json({ agent: safeAgent(agent) });
      }
      if (request.method === "POST" && url.pathname === "/confirm") {
        const input = await request.json<{ confirmedMicroUsd: string; reservationId: string }>();
        await this.confirm(input.reservationId, input.confirmedMicroUsd);
        return Response.json({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/release") {
        const input = await request.json<{ reservationId: string }>();
        await this.release(input.reservationId);
        return Response.json({ ok: true });
      }
      if (request.method === "POST" && url.pathname === "/upstream-error") {
        const input = await request.json<Omit<LedgerEvent, "id" | "timestamp" | "type">>();
        await this.update((state) => appendEvent(state, { ...input, type: "UPSTREAM_ERROR" }));
        return Response.json({ ok: true });
      }
      if (request.method === "GET" && url.pathname === "/dashboard") {
        return Response.json(await this.dashboard(url.searchParams.get("live") === "1"));
      }
      if (request.method === "GET" && url.pathname === "/connection") {
        return Response.json(await this.connectionStatus());
      }
      if (request.method === "POST" && url.pathname === "/oauth/start") {
        return Response.json(await this.startOrbioOAuth(await request.json<{ tenantLocator: string }>()));
      }
      if (request.method === "POST" && url.pathname === "/oauth/callback") {
        return Response.json(await this.finishOrbioOAuth(await request.json<{ code: string; state: string }>()));
      }
      if (request.method === "POST" && url.pathname === "/connection/provision") {
        return Response.json(await this.provisionGatewayKey(await request.json<{ allowRotation?: boolean }>().catch(() => ({}))));
      }
      if (request.method === "GET" && url.pathname === "/credentials") {
        const key = await this.gatewayKey();
        return key ? Response.json({ key }) : guardError(503, "ORBIO_NOT_CONNECTED", "Connect and provision Orbio first.");
      }
      if (url.pathname === "/agents" && request.method === "GET") {
        return Response.json((await this.read()).agents.map(safeAgent));
      }
      if (url.pathname === "/agents" && request.method === "POST") {
        return Response.json(await this.addAgent(await request.json(), url.searchParams.get("tenant") ?? "primary"), { status: 201 });
      }
      const statusMatch = url.pathname.match(/^\/agents\/([^/]+)\/status$/);
      if (statusMatch && request.method === "PUT") {
        const input = await request.json<{ status: CloudAgentStatus }>();
        return Response.json(await this.setStatus(statusMatch[1]!, input.status));
      }
      const archiveMatch = url.pathname.match(/^\/agents\/([^/]+)\/archive$/);
      if (archiveMatch && request.method === "PUT") {
        return Response.json(await this.archiveAgent(archiveMatch[1]!));
      }
      return guardError(404, "NOT_FOUND", "Coordinator endpoint not found.");
    } catch (error) {
      return guardError(400, "INVALID_REQUEST", errorMessage(error));
    }
  }

  private async authorize(raw: unknown) {
    const input = raw as {
      estimatedCostMicroUsd?: unknown;
      model?: unknown;
      requestId?: unknown;
      token?: unknown;
    };
    if (
      typeof input.token !== "string" ||
      typeof input.model !== "string" ||
      typeof input.estimatedCostMicroUsd !== "string" ||
      typeof input.requestId !== "string"
    ) {
      throw new Error("Authorization input is invalid.");
    }
    const tokenHash = await sha256(input.token);
    return this.update(async (state) => {
      recoverStaleReservations(state);
      const agent = state.agents.find((candidate) => safeEqual(candidate.tokenHash, tokenHash));
      if (!agent) {
        appendEvent(state, {
          model: input.model as string,
          reasonCode: "INVALID_AGENT_TOKEN",
          requestId: input.requestId as string,
          type: "REQUEST_BLOCKED",
        });
        return { error: { code: "INVALID_AGENT_TOKEN", message: "The Guard agent token is invalid." } };
      }
      const decision = evaluateCloudPolicy(agent, {
        estimatedCostMicroUsd: input.estimatedCostMicroUsd as string,
        model: input.model as string,
      });
      if (!decision.allowed) {
        appendEvent(state, {
          agentId: agent.id,
          model: input.model as string,
          reasonCode: decision.code,
          requestId: input.requestId as string,
          type: "REQUEST_BLOCKED",
        });
        return { error: decision };
      }
      const date = utcDate();
      const budget = getBudget(state, agent.id, date);
      const reserved = budget.reservations.reduce(
        (total, reservation) => total + BigInt(reservation.amountMicroUsd),
        0n,
      );
      const amount = BigInt(input.estimatedCostMicroUsd as string);
      if (BigInt(budget.confirmedMicroUsd) + reserved + amount > BigInt(agent.dailyBudgetMicroUsd)) {
        appendEvent(state, {
          agentId: agent.id,
          amountMicroUsd: amount.toString(),
          model: input.model as string,
          reasonCode: "DAILY_BUDGET_EXCEEDED",
          requestId: input.requestId as string,
          type: "REQUEST_BLOCKED",
        });
        return {
          error: {
            code: "DAILY_BUDGET_EXCEEDED",
            message: "Daily budget does not have enough remaining credit.",
          },
        };
      }
      const reservation: Reservation = {
        agentId: agent.id,
        amountMicroUsd: amount.toString(),
        createdAt: new Date().toISOString(),
        id: crypto.randomUUID(),
      };
      budget.reservations.push(reservation);
      appendEvent(state, { agentId: agent.id, amountMicroUsd: amount.toString(), type: "BUDGET_RESERVED" });
      appendEvent(state, {
        agentId: agent.id,
        amountMicroUsd: amount.toString(),
        model: input.model as string,
        requestId: input.requestId as string,
        type: "REQUEST_ALLOWED",
      });
      return { agent: safeAgent(agent), reservation };
    });
  }

  private async confirm(reservationId: string, confirmedMicroUsd: string): Promise<void> {
    await this.update((state) => {
      const located = findReservation(state, reservationId);
      if (!located) return;
      located.budget.reservations.splice(located.index, 1);
      located.budget.confirmedMicroUsd = (
        BigInt(located.budget.confirmedMicroUsd) + BigInt(confirmedMicroUsd)
      ).toString();
      appendEvent(state, {
        agentId: located.reservation.agentId,
        amountMicroUsd: confirmedMicroUsd,
        type: "SPEND_CONFIRMED",
      });
    });
  }

  private async release(reservationId: string): Promise<void> {
    await this.update((state) => {
      const located = findReservation(state, reservationId);
      if (!located) return;
      located.budget.reservations.splice(located.index, 1);
      appendEvent(state, {
        agentId: located.reservation.agentId,
        amountMicroUsd: located.reservation.amountMicroUsd,
        type: "RESERVATION_RELEASED",
      });
    });
  }

  private async addAgent(raw: unknown, tenantLocator: string) {
    const input = raw as Record<string, unknown>;
    const allowedModels = input.allowedModels;
    if (
      typeof input.name !== "string" ||
      !input.name.trim() ||
      !Array.isArray(allowedModels) ||
      !allowedModels.every((value) => typeof value === "string") ||
      typeof input.dailyBudgetMicroUsd !== "string" ||
      (input.maxRequestMicroUsd !== null && typeof input.maxRequestMicroUsd !== "string")
    ) {
      throw new Error("Agent input is invalid.");
    }
    validateCloudModelPatterns(allowedModels);
    BigInt(input.dailyBudgetMicroUsd);
    if (input.maxRequestMicroUsd !== null) BigInt(input.maxRequestMicroUsd);
    if (!/^[a-zA-Z0-9_-]{3,64}$/.test(tenantLocator)) throw new Error("Tenant locator is invalid.");
    const token = `og_agent_${tenantLocator}.${randomToken()}`;
    const now = new Date().toISOString();
    const agent: CloudAgent = {
      allowedModels: [...new Set(allowedModels)],
      archivedAt: null,
      createdAt: now,
      dailyBudgetMicroUsd: input.dailyBudgetMicroUsd,
      id: crypto.randomUUID(),
      maxRequestMicroUsd: input.maxRequestMicroUsd,
      name: input.name.trim(),
      project: typeof input.project === "string" ? input.project.trim() || null : null,
      status: "active",
      tokenHash: await sha256(token),
      updatedAt: now,
    };
    await this.update((state) => {
      state.agents.push(agent);
      appendEvent(state, { agentId: agent.id, type: "AGENT_CREATED" });
    });
    return { agent: safeAgent(agent), token };
  }

  private async setStatus(agentId: string, status: CloudAgentStatus) {
    if (!(["active", "paused", "disabled"] as string[]).includes(status)) {
      throw new Error("Agent status is invalid.");
    }
    return this.update((state) => {
      const agent = state.agents.find((candidate) => candidate.id === agentId);
      if (!agent) throw new Error("Agent was not found.");
      agent.status = status;
      agent.updatedAt = new Date().toISOString();
      appendEvent(state, { agentId, type: "AGENT_STATUS_CHANGED" });
      return safeAgent(agent);
    });
  }

  private async archiveAgent(agentId: string) {
    return this.update((state) => {
      const agent = state.agents.find((candidate) => candidate.id === agentId);
      if (!agent) throw new Error("Agent was not found.");
      if (agent.status !== "disabled") {
        throw new Error("Disable an agent before archiving it.");
      }
      agent.archivedAt = new Date().toISOString();
      agent.updatedAt = agent.archivedAt;
      appendEvent(state, { agentId, type: "AGENT_ARCHIVED" });
      return safeAgent(agent);
    });
  }

  private async dashboard(includeRemote: boolean) {
    const state = await this.read();
    recoverStaleReservations(state);
    await this.ctx.storage.put("state", state);
    const date = utcDate();
    const agents = activeCloudAgents(state.agents).map((agent) => {
      const budget = state.budgets.find((entry) => entry.agentId === agent.id && entry.date === date);
      const confirmed = BigInt(budget?.confirmedMicroUsd ?? "0");
      const reserved = budget?.reservations.reduce(
        (total, reservation) => total + BigInt(reservation.amountMicroUsd),
        0n,
      ) ?? 0n;
      const limit = BigInt(agent.dailyBudgetMicroUsd);
      return {
        ...safeAgent(agent),
        budgetPercent: limit === 0n ? 0 : Math.min(100, Number(((confirmed + reserved) * 10_000n) / limit) / 100),
        confirmedUsd: formatCloudUsd(confirmed.toString()),
        dailyBudgetUsd: formatCloudUsd(agent.dailyBudgetMicroUsd),
        reservedUsd: formatCloudUsd(reserved.toString()),
      };
    });
    const confirmed = agents.reduce((total, agent) => total + Number(agent.confirmedUsd), 0);
    const reserved = agents.reduce((total, agent) => total + Number(agent.reservedUsd), 0);
    const tenantConnection = await this.connectionStatus();
    const snapshot = {
      activity: state.ledger.slice(-80).reverse(),
      archivedAgentCount: state.agents.length - agents.length,
      agents,
      deployment: "cloudflare",
      generatedAt: new Date().toISOString(),
      mode: "live",
      remote: { balanceUsd: null, wallets: ["Orbio account · live inference"] } as Record<string, unknown>,
      remoteLastUsedAt: latestCloudKeyUse(state.ledger.slice().reverse()),
      summary: {
        activeAgents: agents.filter((agent) => agent.status === "active").length,
        confirmedTodayUsd: confirmed.toString(),
        disabledAgents: agents.filter((agent) => agent.status === "disabled").length,
        reservedTodayUsd: reserved.toString(),
        totalAgents: agents.length,
      },
      tenantConnection,
    };
    if (includeRemote && tenantConnection.connected) {
      try {
        const [balanceResult, keyResult] = await Promise.all([
          this.callOrbioTool("orbio_get_balance"),
          this.callOrbioTool("orbio_get_key_status"),
        ]);
        const balance = structuredResult(balanceResult);
        const key = structuredResult(keyResult);
        const balanceValue = balance.balance as Record<string, unknown> | undefined;
        snapshot.remote = {
          balanceUsd: typeof balanceValue?.usd === "number" ? balanceValue.usd : null,
          wallets: Array.isArray(balance.wallets)
            ? balance.wallets.filter((wallet): wallet is string => typeof wallet === "string").map(maskCloudWallet)
            : [],
          keyCreatedAt: typeof key.createdAt === "string" ? key.createdAt : null,
          keyLastUsedAt: typeof key.lastUsedAt === "string" ? key.lastUsedAt : null,
        };
      } catch (error) {
        snapshot.remote = { error: errorMessage(error) };
      }
    }
    return snapshot;
  }

  private async connectionStatus() {
    const state = await this.read();
    const connected = Boolean(state.connection?.encryptedTokens);
    const provisioned = Boolean(state.connection?.encryptedGatewayKey);
    return { connected, provisioned, fingerprint: state.connection?.keyFingerprint ?? null };
  }

  private async startOrbioOAuth(input: { tenantLocator: string }) {
    const current = await this.read();
    if (
      current.connection?.provisioningAttemptAt &&
      Date.now() - new Date(current.connection.provisioningAttemptAt).getTime() < 10_000
    ) {
      throw new Error("Wait ten seconds before starting another Orbio connection.");
    }
    const redirectUri = ORBIO_OAUTH_CALLBACK;
    const registration = await fetch("https://www.orbio.so/api/mcp/oauth/register", {
      body: JSON.stringify({
        client_name: "Orbio Guard Cloud",
        redirect_uris: [redirectUri],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: "orbio:credits",
        software_id: "orbio-guard-cloud",
        software_version: "0.1.0",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (!registration.ok) throw new Error("Orbio OAuth client registration failed.");
    const clientInformation = await registration.json<Record<string, unknown>>();
    if (typeof clientInformation.client_id !== "string") throw new Error("Orbio did not return an OAuth client ID.");
    const pkceVerifier = randomToken();
    const challenge = base64Url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(pkceVerifier)));
    const nonce = randomToken();
    const oauthState = `${input.tenantLocator}.${nonce}`;
    await this.update((state) => {
      state.connection = {
        ...state.connection,
        clientInformation,
        oauthState,
        pkceVerifier,
        provisioningAttemptAt: new Date().toISOString(),
      };
      appendEvent(state, { type: "ORBIO_CONNECT_STARTED" });
    });
    const authorization = new URL("https://www.orbio.so/mcp/authorize");
    authorization.searchParams.set("response_type", "code");
    authorization.searchParams.set("client_id", clientInformation.client_id);
    authorization.searchParams.set("redirect_uri", redirectUri);
    authorization.searchParams.set("scope", "orbio:credits");
    authorization.searchParams.set("state", oauthState);
    authorization.searchParams.set("code_challenge", challenge);
    authorization.searchParams.set("code_challenge_method", "S256");
    authorization.searchParams.set("resource", "https://www.orbio.so/api/mcp");
    return { authorizationUrl: authorization.toString() };
  }

  private async finishOrbioOAuth(input: { code: string; state: string }) {
    const state = await this.read();
    const connection = state.connection;
    if (!connection?.oauthState || !connection.pkceVerifier || input.state !== connection.oauthState) {
      throw new Error("Orbio OAuth state validation failed.");
    }
    const clientId = connection.clientInformation?.client_id;
    if (typeof clientId !== "string") throw new Error("Orbio OAuth client is missing.");
    const tokenResponse = await fetch("https://www.orbio.so/api/mcp/oauth/token", {
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        client_id: clientId,
        redirect_uri: ORBIO_OAUTH_CALLBACK,
        code_verifier: connection.pkceVerifier,
        resource: "https://www.orbio.so/api/mcp",
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    if (!tokenResponse.ok) throw new Error("Orbio OAuth token exchange failed.");
    const tokens = await tokenResponse.json<Record<string, unknown>>();
    if (typeof tokens.access_token !== "string") throw new Error("Orbio did not return an access token.");
    tokens.obtained_at = Date.now();
    const encryptedTokens = await encryptCloudValue(tokens, this.env.ORBIO_DATA_ENCRYPTION_KEY);
    await this.update((current) => {
      const next = { ...current.connection, encryptedTokens };
      delete next.oauthState;
      delete next.pkceVerifier;
      current.connection = next;
      appendEvent(current, { type: "ORBIO_CONNECTED" });
    });
    return { connected: true };
  }

  private async provisionGatewayKey(input: { allowRotation?: boolean }) {
    const status = await this.callOrbioTool("orbio_get_key_status");
    const statusValue = structuredResult(status);
    if (statusValue.hasKey === true && input.allowRotation !== true) {
      return {
        conflict: true,
        message: "This Orbio account already has an active gateway key. Replacing it invalidates that key for every current consumer.",
      };
    }
    const result = await this.callOrbioTool("orbio_create_key", { label: "Orbio Guard Cloud" });
    const key = findSecret(result);
    if (!key) throw new Error("Orbio key creation did not return a recognizable key.");
    const encryptedGatewayKey = await encryptCloudValue({ key }, this.env.ORBIO_DATA_ENCRYPTION_KEY);
    await this.update((state) => {
      const next = { ...state.connection, encryptedGatewayKey };
      delete next.keyFingerprint;
      state.connection = next;
      appendEvent(state, { type: "KEY_CREATED" });
    });
    const fingerprint = (await sha256(key)).slice(0, 12);
    await this.update((state) => {
      state.connection = { ...state.connection, keyFingerprint: fingerprint };
    });
    return { fingerprint, provisioned: true };
  }

  private async gatewayKey(): Promise<string | null> {
    const encrypted = (await this.read()).connection?.encryptedGatewayKey;
    if (!encrypted) return null;
    const value = await decryptCloudValue<{ key: string }>(encrypted, this.env.ORBIO_DATA_ENCRYPTION_KEY);
    return value.key;
  }

  private async callOrbioTool(name: string, args: Record<string, unknown> = {}) {
    const state = await this.read();
    const encryptedTokens = state.connection?.encryptedTokens;
    if (!encryptedTokens) throw new Error("Connect Orbio first.");
    const tokens = await this.currentTokens(encryptedTokens, state.connection?.clientInformation);
    const accessToken = tokens.access_token;
    if (typeof accessToken !== "string") throw new Error("Orbio access token is missing.");
    const headers: Record<string, string> = {
      authorization: `Bearer ${accessToken}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    };
    const initialize = await fetch("https://www.orbio.so/api/mcp", {
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "orbio-guard-cloud", version: "0.1.0" } } }),
      headers,
      method: "POST",
    });
    if (!initialize.ok) throw new Error("Orbio MCP initialization failed.");
    const session = initialize.headers.get("mcp-session-id");
    if (session) headers["mcp-session-id"] = session;
    await fetch("https://www.orbio.so/api/mcp", {
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      headers,
      method: "POST",
    });
    const response = await fetch("https://www.orbio.so/api/mcp", {
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: args } }),
      headers,
      method: "POST",
    });
    if (!response.ok) throw new Error(`Orbio MCP tool ${name} failed.`);
    const rpc = parseMcpResponse(await response.text());
    if (rpc.error) throw new Error(`Orbio MCP tool ${name} returned an error.`);
    return rpc.result;
  }

  private async currentTokens(
    encrypted: EncryptedValue,
    clientInformation: Record<string, unknown> | undefined,
  ): Promise<Record<string, unknown>> {
    const tokens = await decryptCloudValue<Record<string, unknown>>(encrypted, this.env.ORBIO_DATA_ENCRYPTION_KEY);
    const obtainedAt = typeof tokens.obtained_at === "number" ? tokens.obtained_at : 0;
    const expiresIn = typeof tokens.expires_in === "number" ? tokens.expires_in : 0;
    if (!expiresIn || Date.now() < obtainedAt + expiresIn * 1_000 - 60_000) return tokens;
    if (typeof tokens.refresh_token !== "string" || typeof clientInformation?.client_id !== "string") {
      throw new Error("Orbio session expired. Reconnect Orbio.");
    }
    const response = await fetch("https://www.orbio.so/api/mcp/oauth/token", {
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: clientInformation.client_id,
        resource: "https://www.orbio.so/api/mcp",
      }),
      headers: { "content-type": "application/x-www-form-urlencoded" },
      method: "POST",
    });
    if (!response.ok) throw new Error("Orbio session refresh failed. Reconnect Orbio.");
    const refreshed = await response.json<Record<string, unknown>>();
    refreshed.obtained_at = Date.now();
    if (!refreshed.refresh_token) refreshed.refresh_token = tokens.refresh_token;
    const encryptedTokens = await encryptCloudValue(refreshed, this.env.ORBIO_DATA_ENCRYPTION_KEY);
    await this.update((state) => {
      state.connection = { ...state.connection, encryptedTokens };
      appendEvent(state, { type: "ORBIO_SESSION_REFRESHED" });
    });
    return refreshed;
  }

  private async read(): Promise<GuardState> {
    return (await this.ctx.storage.get<GuardState>("state")) ?? { agents: [], budgets: [], ledger: [] };
  }

  private async update<T>(mutator: (state: GuardState) => T | Promise<T>): Promise<T> {
    const state = await this.read();
    const result = await mutator(state);
    state.ledger = state.ledger.slice(-1_000);
    await this.ctx.storage.put("state", state);
    return result;
  }
}

export default {
  async fetch(request: Request, env: Env, execution: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const testHostname = env.BOOTSTRAP_TOKEN && request.headers.get("x-orbio-bootstrap-token") === env.BOOTSTRAP_TOKEN
      ? request.headers.get("x-orbio-test-host")
      : null;
    const effectiveHostname = testHostname ?? url.hostname;
    const isInferenceHost = effectiveHostname === "api.guard.larkvine.org";
    if (effectiveHostname === "auth.guard.larkvine.org") {
      return request.method === "GET" && url.pathname === "/orbio/callback"
        ? finishOAuthCallback(request, env)
        : guardError(404, "NOT_FOUND", "OAuth callback endpoint not found.");
    }
    if (isInferenceHost) {
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json({ status: "ok" });
      }
      if (request.method === "GET" && url.pathname === "/readyz") {
        return json({ status: env.ORBIO_GUARD_UPSTREAM_KEY ? "ready" : "not_ready" }, env.ORBIO_GUARD_UPSTREAM_KEY ? 200 : 503);
      }
      if (request.method === "GET" && url.pathname === "/v1/models") {
        const tenant = tenantFromAgentRequest(request);
        return proxyModels(request, env, env.GUARD.getByName(tenant));
      }
      if (request.method === "POST" && ROUTES.has(url.pathname)) {
        const tenant = tenantFromAgentRequest(request);
        return proxyInference(request, env, env.GUARD.getByName(tenant), execution, tenant);
      }
      return guardError(404, "NOT_FOUND", "Endpoint not found.");
    }

    const access = await verifyOperator(request, env);
    if (!access.ok) return access.response;
    const identity = access.identity;
    const coordinator = env.GUARD.getByName(identity.tenantLocator);
    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const includeRemote = url.searchParams.get("live") !== "0";
      const response = await coordinator.fetch(`https://guard.internal/dashboard?live=${includeRemote ? "1" : "0"}`);
      const snapshot = await response.json<Record<string, unknown>>();
      snapshot.key = {
        configured: identity.tenantLocator === "primary"
          ? Boolean(env.ORBIO_GUARD_UPSTREAM_KEY)
          : Boolean((snapshot.tenantConnection as { provisioned?: boolean } | undefined)?.provisioned),
        fingerprint: identity.tenantLocator === "primary" && env.ORBIO_GUARD_UPSTREAM_KEY
          ? (await sha256(env.ORBIO_GUARD_UPSTREAM_KEY)).slice(0, 12)
          : (snapshot.tenantConnection as { fingerprint?: string } | undefined)?.fingerprint,
        remoteHasKey: identity.tenantLocator === "primary"
          ? Boolean(env.ORBIO_GUARD_UPSTREAM_KEY)
          : Boolean((snapshot.tenantConnection as { provisioned?: boolean } | undefined)?.provisioned),
        remoteCreatedAt: (snapshot.remote as { keyCreatedAt?: string | null }).keyCreatedAt,
        remoteLastUsedAt: (snapshot.remote as { keyLastUsedAt?: string | null }).keyLastUsedAt ?? snapshot.remoteLastUsedAt,
        remotePrefix: identity.tenantLocator === "primary" ? "Cloudflare secret" : "Tenant vault",
      };
      snapshot.tenant = { email: identity.email, locator: identity.tenantLocator };
      if (identity.tenantLocator === "primary") {
        snapshot.tenantConnection = { connected: true, provisioned: true };
      }
      return json(snapshot);
    }
    if (request.method === "GET" && url.pathname === "/api/orbio/connection") {
      if (identity.tenantLocator === "primary") return json({ connected: true, provisioned: true });
      return coordinator.fetch("https://guard.internal/connection");
    }
    if (request.method === "POST" && url.pathname === "/api/orbio/connect") {
      if (!sameOrigin(request, env)) return guardError(403, "INVALID_ORIGIN", "Connection requires the operator origin.");
      return coordinator.fetch("https://guard.internal/oauth/start", {
        body: JSON.stringify({ tenantLocator: identity.tenantLocator }),
        method: "POST",
      });
    }
    if (request.method === "POST" && url.pathname === "/api/orbio/provision") {
      if (!sameOrigin(request, env)) return guardError(403, "INVALID_ORIGIN", "Provisioning requires the operator origin.");
      return coordinator.fetch(new Request("https://guard.internal/connection/provision", request));
    }
    if (url.pathname === "/api/admin/agents" && ["GET", "POST"].includes(request.method)) {
      if (request.method !== "GET" && !sameOrigin(request, env)) {
        return guardError(403, "INVALID_ORIGIN", "Admin mutations require the operator origin.");
      }
      if (request.method === "POST" && identity.tenantLocator !== "primary") {
        const connection = await coordinator.fetch("https://guard.internal/connection");
        const status = await connection.json<{ provisioned?: boolean }>();
        if (!status.provisioned) {
          return guardError(409, "ORBIO_NOT_CONNECTED", "Connect and provision Orbio before creating agents.");
        }
      }
      return coordinator.fetch(new Request(`https://guard.internal/agents?tenant=${identity.tenantLocator}`, request));
    }
    const statusMatch = url.pathname.match(/^\/api\/admin\/agents\/([^/]+)\/status$/);
    if (statusMatch && request.method === "PUT") {
      if (!sameOrigin(request, env)) {
        return guardError(403, "INVALID_ORIGIN", "Admin mutations require the operator origin.");
      }
      return coordinator.fetch(
        new Request(`https://guard.internal/agents/${statusMatch[1]}/status`, request),
      );
    }
    const archiveMatch = url.pathname.match(/^\/api\/admin\/agents\/([^/]+)\/archive$/);
    if (archiveMatch && request.method === "PUT") {
      if (!sameOrigin(request, env)) {
        return guardError(403, "INVALID_ORIGIN", "Admin mutations require the operator origin.");
      }
      return coordinator.fetch(
        new Request(`https://guard.internal/agents/${archiveMatch[1]}/archive`, request),
      );
    }
    if (url.pathname.startsWith("/api/")) {
      return guardError(404, "NOT_FOUND", "Admin endpoint not found.");
    }
    const assetResponse = await env.ASSETS.fetch(request);
    return secureAsset(assetResponse);
  },
} satisfies ExportedHandler<Env>;

async function proxyInference(
  request: Request,
  env: Env,
  coordinator: DurableObjectStub<GuardCoordinator>,
  execution: ExecutionContext,
  tenantLocator: string,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 1_048_576) return guardError(413, "BODY_TOO_LARGE", "Request body exceeds 1048576 bytes.");
    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > 1_048_576) {
      return guardError(413, "BODY_TOO_LARGE", "Request body exceeds 1048576 bytes.");
    }
    const body = JSON.parse(bodyText) as { model?: unknown; stream?: unknown };
    if (typeof body.model !== "string") return guardError(400, "INVALID_REQUEST", "Request body is invalid.");
    const token = bearerToken(request);
    const estimatedCostMicroUsd = "50000";
    const policyModel = orbioModelId(body.model);
    const authorizationResponse = await coordinator.fetch("https://guard.internal/authorize", {
      body: JSON.stringify({ estimatedCostMicroUsd, model: policyModel, requestId, token }),
      method: "POST",
    });
    const authorization = await authorizationResponse.json<{
      agent?: { id: string };
      error?: { code: string; message: string };
      reservation?: Reservation;
    }>();
    if (authorization.error) {
      const status = authorization.error.code === "INVALID_AGENT_TOKEN" ? 401
        : authorization.error.code.includes("LIMIT") || authorization.error.code.includes("BUDGET") ? 429 : 403;
      return guardError(status, authorization.error.code, authorization.error.message);
    }
    const reservation = authorization.reservation!;
    const requestPath = new URL(request.url).pathname;
    const adaptsResponses = requestPath === "/v1/responses";
    const upstreamPath = adaptsResponses ? "chat/completions" : ROUTES.get(requestPath)!;
    const credentials = tenantLocator === "primary"
      ? { baseUrl: env.ORBIO_GUARD_UPSTREAM_BASE_URL, key: env.ORBIO_GUARD_UPSTREAM_KEY }
      : await tenantCredentials(coordinator, env.ORBIO_GUARD_UPSTREAM_BASE_URL);
    if (!credentials) {
      await release(coordinator, reservation.id);
      return guardError(503, "ORBIO_NOT_CONNECTED", "This tenant has not provisioned an Orbio key.");
    }
    const upstreamUrl = new URL(upstreamPath, trailingSlash(credentials.baseUrl));
    const upstreamBodyText = adaptsResponses
      ? JSON.stringify(responsesToChatRequest(body))
      : JSON.stringify({ ...body, model: policyModel });
    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        body: upstreamBodyText,
        headers: {
          accept: request.headers.get("accept") ?? "application/json",
          authorization: `Bearer ${credentials.key}`,
          "content-type": "application/json",
          ...(request.headers.get("anthropic-version")
            ? { "anthropic-version": request.headers.get("anthropic-version")! }
            : {}),
        },
        method: "POST",
      });
    } catch (error) {
      await release(coordinator, reservation.id);
      await recordUpstreamError(coordinator, authorization.agent!.id, policyModel, requestId);
      return guardError(502, "UPSTREAM_ERROR", "The upstream request failed.");
    }
    if (adaptsResponses) {
      const chatBody = await upstream.text();
      if (!upstream.ok) {
        await release(coordinator, reservation.id);
        await recordUpstreamError(coordinator, authorization.agent!.id, policyModel, requestId, upstream.status);
        return copyUpstream(upstream, chatBody, requestId);
      }
      const cost = extractCloudCostMicroUsd(chatBody) ?? reservation.amountMicroUsd;
      await confirm(coordinator, reservation.id, cost);
      const responseBody = chatResponseToResponsesSse(JSON.parse(chatBody));
      return new Response(responseBody, {
        headers: {
          "cache-control": "no-store",
          "content-type": "text/event-stream; charset=utf-8",
          "x-orbio-guard-request-id": requestId,
        },
      });
    }
    if (body.stream === true && upstream.ok && upstream.body) {
      const [clientStream, auditStream] = upstream.body.tee();
      execution.waitUntil(reconcileStream(auditStream, coordinator, reservation));
      return copyUpstream(upstream, clientStream, requestId);
    }
    const upstreamBody = await upstream.text();
    const cost = extractCloudCostMicroUsd(upstreamBody);
    if (cost !== undefined || upstream.ok) {
      await confirm(coordinator, reservation.id, cost ?? reservation.amountMicroUsd);
    } else {
      await release(coordinator, reservation.id);
      await recordUpstreamError(coordinator, authorization.agent!.id, policyModel, requestId, upstream.status);
    }
    return copyUpstream(upstream, upstreamBody, requestId);
  } catch (error) {
    if (error instanceof SyntaxError) return guardError(400, "INVALID_REQUEST", "Request body is invalid.");
    return guardError(401, "INVALID_AGENT_TOKEN", errorMessage(error));
  }
}

async function proxyModels(
  request: Request,
  env: Env,
  coordinator: DurableObjectStub<GuardCoordinator>,
): Promise<Response> {
  let token: string;
  try {
    token = bearerToken(request);
  } catch {
    return guardError(401, "INVALID_AGENT_TOKEN", "The Guard agent token is invalid.");
  }
  const authentication = await coordinator.fetch("https://guard.internal/authenticate", {
    body: JSON.stringify({ token }),
    method: "POST",
  });
  if (!authentication.ok) {
    return guardError(401, "INVALID_AGENT_TOKEN", "The Guard agent token is invalid.");
  }
  const tenant = tenantFromAgentToken(token);
  const credentials = tenant === "primary"
    ? { baseUrl: env.ORBIO_GUARD_UPSTREAM_BASE_URL, key: env.ORBIO_GUARD_UPSTREAM_KEY }
    : await tenantCredentials(coordinator, env.ORBIO_GUARD_UPSTREAM_BASE_URL);
  if (!credentials) return guardError(503, "ORBIO_NOT_CONNECTED", "This tenant has not provisioned an Orbio key.");
  const response = await fetch(new URL("models", trailingSlash(credentials.baseUrl)), {
    headers: { authorization: `Bearer ${credentials.key}` },
  });
  return copyUpstream(response, response.body ?? "", crypto.randomUUID());
}

async function reconcileStream(
  stream: ReadableStream,
  coordinator: DurableObjectStub<GuardCoordinator>,
  reservation: Reservation,
): Promise<void> {
  const text = await new Response(stream).text();
  await confirm(
    coordinator,
    reservation.id,
    extractCloudStreamCostMicroUsd(text) ?? reservation.amountMicroUsd,
  );
}

async function verifyOperator(
  request: Request,
  env: Env,
): Promise<{ ok: true; identity: AccessIdentity } | { ok: false; response: Response }> {
  const bootstrapToken = request.headers.get("x-orbio-bootstrap-token");
  if (
    env.BOOTSTRAP_TOKEN &&
    bootstrapToken &&
    safeEqual(env.BOOTSTRAP_TOKEN, bootstrapToken)
  ) {
    const testTenant = request.headers.get("x-orbio-test-tenant");
    const tenantLocator = testTenant && /^[a-zA-Z0-9_-]{3,64}$/.test(testTenant)
      ? testTenant
      : "primary";
    return { ok: true, identity: { email: env.PRIMARY_ACCESS_EMAIL, tenantLocator } };
  }
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) {
    return { ok: false, response: guardError(503, "ACCESS_NOT_CONFIGURED", "Cloudflare Access is not configured.") };
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, response: guardError(403, "ACCESS_REQUIRED", "Cloudflare Access authentication is required.") };
  try {
    const teamDomain = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
    const { payload } = await jwtVerify(token, createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)), {
      audience: env.ACCESS_AUD,
      issuer: teamDomain,
    });
    if (typeof payload.email !== "string") throw new Error("Access identity has no email.");
    const email = payload.email.toLowerCase();
    const tenantLocator = email === env.PRIMARY_ACCESS_EMAIL.toLowerCase()
      ? "primary"
      : await tenantLocatorForEmail(email, env.ORBIO_DATA_ENCRYPTION_KEY);
    return { ok: true, identity: { email, tenantLocator } };
  } catch {
    return { ok: false, response: guardError(403, "ACCESS_INVALID", "Cloudflare Access token is invalid.") };
  }
}

function bearerToken(request: Request): string {
  const match = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1] ?? request.headers.get("x-api-key");
  if (!token) throw new Error("The Guard agent token is invalid.");
  return token;
}

function tenantFromAgentRequest(request: Request): string {
  try {
    return tenantFromAgentToken(bearerToken(request));
  } catch {
    return "primary";
  }
}

function tenantFromAgentToken(token: string): string {
  return tenantFromCloudAgentToken(token);
}

async function tenantCredentials(
  coordinator: DurableObjectStub<GuardCoordinator>,
  baseUrl: string,
): Promise<{ baseUrl: string; key: string } | null> {
  const response = await coordinator.fetch("https://guard.internal/credentials");
  if (!response.ok) return null;
  const value = await response.json<{ key: string }>();
  return { baseUrl, key: value.key };
}

async function finishOAuthCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  if (error) return oauthPage(false, "Orbio authorization was declined or failed.");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return oauthPage(false, "Orbio did not return the required authorization values.");
  const tenantLocator = state.split(".")[0];
  if (!tenantLocator || !/^[a-zA-Z0-9_-]{3,64}$/.test(tenantLocator)) {
    return oauthPage(false, "Orbio authorization state is invalid.");
  }
  const response = await env.GUARD.getByName(tenantLocator).fetch("https://guard.internal/oauth/callback", {
    body: JSON.stringify({ code, state }),
    method: "POST",
  });
  return response.ok
    ? oauthPage(true, "Orbio is connected. Return to the Guard dashboard to provision your gateway key.")
    : oauthPage(false, "Orbio connection could not be completed. Return to Guard and try again.");
}

function oauthPage(success: boolean, message: string): Response {
  return new Response(
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orbio Guard connection</title><body><main><h1>${success ? "Connection complete" : "Connection failed"}</h1><p>${message}</p><p><a href="/dashboard/">Return to dashboard</a></p></main></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'" }, status: success ? 200 : 400 },
  );
}

async function confirm(coordinator: DurableObjectStub, reservationId: string, confirmedMicroUsd: string) {
  await coordinator.fetch("https://guard.internal/confirm", {
    body: JSON.stringify({ confirmedMicroUsd, reservationId }),
    method: "POST",
  });
}

async function release(coordinator: DurableObjectStub, reservationId: string) {
  await coordinator.fetch("https://guard.internal/release", {
    body: JSON.stringify({ reservationId }),
    method: "POST",
  });
}

async function recordUpstreamError(
  coordinator: DurableObjectStub,
  agentId: string,
  model: string,
  requestId: string,
  httpStatus?: number,
) {
  await coordinator.fetch("https://guard.internal/upstream-error", {
    body: JSON.stringify({ agentId, httpStatus, model, requestId }),
    method: "POST",
  });
}

function copyUpstream(upstream: Response, body: BodyInit | ReadableStream, requestId: string): Response {
  const headers = new Headers();
  headers.set("cache-control", upstream.headers.get("cache-control") ?? "no-store");
  headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");
  headers.set("x-orbio-guard-request-id", requestId);
  const upstreamRequestId = upstream.headers.get("x-request-id");
  if (upstreamRequestId) headers.set("x-request-id", upstreamRequestId);
  return new Response(body, { headers, status: upstream.status, statusText: upstream.statusText });
}

function secureAsset(response: Response): Response {
  const secured = new Response(response.body, response);
  secured.headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  secured.headers.set("referrer-policy", "no-referrer");
  secured.headers.set("x-content-type-options", "nosniff");
  secured.headers.set("x-frame-options", "DENY");
  return secured;
}

function safeAgent(agent: CloudAgent) {
  const { tokenHash, ...safe } = agent;
  return { ...safe, tokenFingerprint: tokenHash.slice(0, 12) };
}

function appendEvent(state: GuardState, input: Omit<LedgerEvent, "id" | "timestamp">): void {
  state.ledger.push({ ...input, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
}

function getBudget(state: GuardState, agentId: string, date: string): BudgetDay {
  let budget = state.budgets.find((entry) => entry.agentId === agentId && entry.date === date);
  if (!budget) {
    budget = { agentId, confirmedMicroUsd: "0", date, reservations: [] };
    state.budgets.push(budget);
  }
  return budget;
}

function findReservation(state: GuardState, reservationId: string) {
  for (const budget of state.budgets) {
    const index = budget.reservations.findIndex((reservation) => reservation.id === reservationId);
    if (index >= 0) return { budget, index, reservation: budget.reservations[index]! };
  }
  return undefined;
}

function recoverStaleReservations(state: GuardState): void {
  const threshold = Date.now() - 300_000;
  for (const budget of state.budgets) {
    const retained: Reservation[] = [];
    for (const reservation of budget.reservations) {
      if (new Date(reservation.createdAt).getTime() >= threshold) {
        retained.push(reservation);
        continue;
      }
      budget.confirmedMicroUsd = (BigInt(budget.confirmedMicroUsd) + BigInt(reservation.amountMicroUsd)).toString();
      appendEvent(state, {
        agentId: reservation.agentId,
        amountMicroUsd: reservation.amountMicroUsd,
        reasonCode: "STALE_RESERVATION_CONFIRMED",
        type: "RESERVATION_RECOVERED",
      });
    }
    budget.reservations = retained;
  }
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function tenantLocatorForEmail(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return `t_${base64Url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(email))).slice(0, 24)}`;
}

function maskCloudWallet(wallet: string): string {
  return wallet.length > 12 ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}` : wallet;
}

function base64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseMcpResponse(value: string): { error?: unknown; result?: unknown } {
  const data = value.trim().startsWith("event:")
    ? value.split(/\r?\n/).find((line) => line.startsWith("data:"))?.slice(5).trim()
    : value;
  if (!data) throw new Error("Orbio MCP returned an empty response.");
  return JSON.parse(data) as { error?: unknown; result?: unknown };
}

function structuredResult(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") throw new Error("Orbio returned an invalid result.");
  const result = value as Record<string, unknown>;
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent as Record<string, unknown>;
  }
  throw new Error("Orbio returned no structured result.");
}

function findSecret(value: unknown): string | null {
  if (typeof value === "string") {
    const match = value.match(/sk-orbio-[A-Za-z0-9_-]+/);
    if (match) return match[0];
    try { return findSecret(JSON.parse(value)); } catch { return null; }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findSecret(item);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = findSecret(nested);
      if (found) return found;
    }
  }
  return null;
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function utcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function trailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function sameOrigin(request: Request, env: Env): boolean {
  const origin = request.headers.get("origin");
  const bootstrap = request.headers.get("x-orbio-bootstrap-token");
  return origin === "https://guard.larkvine.org" || Boolean(
    env.BOOTSTRAP_TOKEN && bootstrap && safeEqual(env.BOOTSTRAP_TOKEN, bootstrap),
  );
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" }, status });
}

function guardError(status: number, code: string, message: string): Response {
  return json({ error: { code, message, type: "orbio_guard_error" } }, status);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error.";
}
