import { DurableObject } from "cloudflare:workers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  activeCloudAgents,
  evaluateCloudPolicy,
  extractCloudCostMicroUsd,
  extractCloudStreamCostMicroUsd,
  formatCloudUsd,
  latestCloudKeyUse,
  validateCloudModelPatterns,
  type CloudAgent,
  type CloudAgentStatus,
} from "../../src/cloudflare/core.js";

interface Env {
  ACCESS_AUD: string;
  ACCESS_TEAM_DOMAIN: string;
  ASSETS: Fetcher;
  BOOTSTRAP_TOKEN?: string;
  GUARD: DurableObjectNamespace<GuardCoordinator>;
  ORBIO_GUARD_UPSTREAM_BASE_URL: string;
  ORBIO_GUARD_UPSTREAM_KEY: string;
}

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
  ledger: LedgerEvent[];
}

const ROUTES = new Map([
  ["/v1/chat/completions", "chat/completions"],
  ["/v1/responses", "responses"],
  ["/v1/messages", "messages"],
]);

export class GuardCoordinator extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/authorize") {
        return Response.json(await this.authorize(await request.json()));
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
        return Response.json(await this.dashboard());
      }
      if (url.pathname === "/agents" && request.method === "GET") {
        return Response.json((await this.read()).agents.map(safeAgent));
      }
      if (url.pathname === "/agents" && request.method === "POST") {
        return Response.json(await this.addAgent(await request.json()), { status: 201 });
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

  private async addAgent(raw: unknown) {
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
    const token = `og_agent_${randomToken()}`;
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

  private async dashboard() {
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
    return {
      activity: state.ledger.slice(-80).reverse(),
      archivedAgentCount: state.agents.length - agents.length,
      agents,
      deployment: "cloudflare",
      generatedAt: new Date().toISOString(),
      mode: "live",
      remote: { balanceUsd: null, wallets: ["Orbio account · live inference"] },
      remoteLastUsedAt: latestCloudKeyUse(state.ledger.slice().reverse()),
      summary: {
        activeAgents: agents.filter((agent) => agent.status === "active").length,
        confirmedTodayUsd: confirmed.toString(),
        disabledAgents: agents.filter((agent) => agent.status === "disabled").length,
        reservedTodayUsd: reserved.toString(),
        totalAgents: agents.length,
      },
    };
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
    const isInferenceHost = (testHostname ?? url.hostname) === "api.guard.larkvine.org";
    const coordinator = env.GUARD.getByName("primary");
    if (isInferenceHost) {
      if (request.method === "GET" && url.pathname === "/healthz") {
        return json({ status: "ok" });
      }
      if (request.method === "GET" && url.pathname === "/readyz") {
        return json({ status: env.ORBIO_GUARD_UPSTREAM_KEY ? "ready" : "not_ready" }, env.ORBIO_GUARD_UPSTREAM_KEY ? 200 : 503);
      }
      if (request.method === "POST" && ROUTES.has(url.pathname)) {
        return proxyInference(request, env, coordinator, execution);
      }
      return guardError(404, "NOT_FOUND", "Endpoint not found.");
    }

    const access = await verifyOperator(request, env);
    if (!access.ok) return access.response;
    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      const response = await coordinator.fetch("https://guard.internal/dashboard");
      const snapshot = await response.json<Record<string, unknown>>();
      snapshot.key = {
        configured: Boolean(env.ORBIO_GUARD_UPSTREAM_KEY),
        fingerprint: env.ORBIO_GUARD_UPSTREAM_KEY
          ? (await sha256(env.ORBIO_GUARD_UPSTREAM_KEY)).slice(0, 12)
          : undefined,
        remoteHasKey: Boolean(env.ORBIO_GUARD_UPSTREAM_KEY),
        remoteLastUsedAt: snapshot.remoteLastUsedAt,
        remotePrefix: "Cloudflare secret",
      };
      return json(snapshot);
    }
    if (url.pathname === "/api/admin/agents" && ["GET", "POST"].includes(request.method)) {
      if (request.method !== "GET" && !sameOrigin(request, env)) {
        return guardError(403, "INVALID_ORIGIN", "Admin mutations require the operator origin.");
      }
      return coordinator.fetch(new Request(`https://guard.internal/agents`, request));
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
    const authorizationResponse = await coordinator.fetch("https://guard.internal/authorize", {
      body: JSON.stringify({ estimatedCostMicroUsd, model: body.model, requestId, token }),
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
    const upstreamPath = ROUTES.get(new URL(request.url).pathname)!;
    const upstreamUrl = new URL(upstreamPath, trailingSlash(env.ORBIO_GUARD_UPSTREAM_BASE_URL));
    let upstream: Response;
    try {
      upstream = await fetch(upstreamUrl, {
        body: bodyText,
        headers: {
          accept: request.headers.get("accept") ?? "application/json",
          authorization: `Bearer ${env.ORBIO_GUARD_UPSTREAM_KEY}`,
          "content-type": "application/json",
          ...(request.headers.get("anthropic-version")
            ? { "anthropic-version": request.headers.get("anthropic-version")! }
            : {}),
        },
        method: "POST",
      });
    } catch (error) {
      await release(coordinator, reservation.id);
      await recordUpstreamError(coordinator, authorization.agent!.id, body.model, requestId);
      return guardError(502, "UPSTREAM_ERROR", "The upstream request failed.");
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
      await recordUpstreamError(coordinator, authorization.agent!.id, body.model, requestId, upstream.status);
    }
    return copyUpstream(upstream, upstreamBody, requestId);
  } catch (error) {
    if (error instanceof SyntaxError) return guardError(400, "INVALID_REQUEST", "Request body is invalid.");
    return guardError(401, "INVALID_AGENT_TOKEN", errorMessage(error));
  }
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
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const bootstrapToken = request.headers.get("x-orbio-bootstrap-token");
  if (
    env.BOOTSTRAP_TOKEN &&
    bootstrapToken &&
    safeEqual(env.BOOTSTRAP_TOKEN, bootstrapToken)
  ) {
    return { ok: true };
  }
  if (!env.ACCESS_AUD || !env.ACCESS_TEAM_DOMAIN) {
    return { ok: false, response: guardError(503, "ACCESS_NOT_CONFIGURED", "Cloudflare Access is not configured.") };
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, response: guardError(403, "ACCESS_REQUIRED", "Cloudflare Access authentication is required.") };
  try {
    const teamDomain = env.ACCESS_TEAM_DOMAIN.replace(/\/$/, "");
    await jwtVerify(token, createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)), {
      audience: env.ACCESS_AUD,
      issuer: teamDomain,
    });
    return { ok: true };
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
