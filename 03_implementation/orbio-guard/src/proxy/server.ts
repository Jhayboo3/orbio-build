import { randomUUID } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { z } from "zod";
import type { GuardConfig } from "../config/schema.js";
import {
  GuardAuthorizationError,
  GuardRequestAuthorizer,
} from "../control/authorizer.js";
import {
  GuardControlService,
  InvalidAgentTokenError,
} from "../control/service.js";
import { serveDashboardRequest } from "../dashboard/http.js";
import { DashboardService } from "../dashboard/service.js";
import { BudgetService } from "../domain/budget.js";
import { LedgerService } from "../domain/ledger.js";
import { GuardStateStore } from "../state/store.js";
import { UpstreamKeyStore } from "../upstream/key-store.js";
import {
  extractCostMicroUsd,
  extractStreamCostMicroUsd,
} from "./usage.js";

const chatCompletionSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(z.unknown()).min(1),
    stream: z.boolean().optional(),
  })
  .loose();

const responsesSchema = z
  .object({
    model: z.string().min(1),
    input: z.unknown(),
    stream: z.boolean().optional(),
  })
  .loose();

const anthropicMessagesSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(z.unknown()).min(1),
    stream: z.boolean().optional(),
  })
  .loose();

const PROXY_ROUTES = new Map([
  [
    "/v1/chat/completions",
    { schema: chatCompletionSchema, upstreamPath: "chat/completions" },
  ],
  ["/v1/responses", { schema: responsesSchema, upstreamPath: "responses" }],
  [
    "/v1/messages",
    { schema: anthropicMessagesSchema, upstreamPath: "messages" },
  ],
]);

export interface ProxyRuntime {
  close(): Promise<void>;
  server: Server;
}

export async function startProxyServer(
  config: GuardConfig,
  fetchImplementation: typeof fetch = fetch,
): Promise<ProxyRuntime> {
  const stateStore = new GuardStateStore(config.stateDirectory);
  const control = new GuardControlService(stateStore);
  const budgets = new BudgetService(stateStore);
  const ledger = new LedgerService(stateStore);
  const authorizer = new GuardRequestAuthorizer(control, budgets, ledger);
  const keyStore = new UpstreamKeyStore(config.stateDirectory);
  const dashboard = new DashboardService(config, stateStore, keyStore);

  const server = createServer((request, response) => {
    void handleRequest({
      authorizer,
      budgets,
      config,
      control,
      dashboard,
      fetchImplementation,
      keyStore,
      ledger,
      request,
      response,
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, resolve);
  });

  return {
    server,
    async close() {
      if (!server.listening) {
        return;
      }
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function handleRequest(input: {
  authorizer: GuardRequestAuthorizer;
  budgets: BudgetService;
  config: GuardConfig;
  control: GuardControlService;
  dashboard: DashboardService;
  fetchImplementation: typeof fetch;
  keyStore: UpstreamKeyStore;
  ledger: LedgerService;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  const { request, response } = input;
  const requestId = randomUUID();
  response.setHeader("x-orbio-guard-request-id", requestId);

  try {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${input.config.host}:${input.config.port}`,
    );
    if (
      request.method === "GET" &&
      (await serveDashboardRequest(requestUrl, response, input.dashboard))
    ) {
      return;
    }

    const route = PROXY_ROUTES.get(requestUrl.pathname);
    if (request.method !== "POST" || !route) {
      sendError(response, 404, "NOT_FOUND", "Endpoint not found.");
      return;
    }

    const agentToken = bearerToken(
      request.headers.authorization,
      request.headers["x-api-key"],
    );
    const bodyText = await readBody(request, input.config.maxBodyBytes);
    const body = route.schema.parse(JSON.parse(bodyText));
    const agent = await input.control.authenticateAgent(agentToken);
    const estimatedCostMicroUsd =
      agent.maxRequestMicroUsd ?? input.config.defaultReservationMicroUsd;
    const credentials = await input.keyStore.load();
    const authorization = await input.authorizer.authorize({
      agentToken,
      estimatedCostMicroUsd,
      model: body.model,
      requestId,
    });
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(new Error("Upstream request timed out.")),
      input.config.requestTimeoutMs,
    );
    const abortOnClientClose = () => abortController.abort();
    request.once("aborted", abortOnClientClose);
    response.once("close", abortOnClientClose);

    try {
      const upstreamResponse = await input.fetchImplementation(
        new URL(route.upstreamPath, withTrailingSlash(credentials.baseUrl)),
        {
          body: bodyText,
          headers: upstreamHeaders(request, credentials.key),
          method: "POST",
          signal: abortController.signal,
        },
      );

      if (body.stream && upstreamResponse.ok && upstreamResponse.body) {
        await streamUpstreamResponse({
          authorization,
          budgets: input.budgets,
          response,
          upstreamResponse,
        });
        return;
      }

      const upstreamBody = await upstreamResponse.text();
      await reconcileBufferedResponse(
        input.budgets,
        authorization.reservation.id,
        authorization.reservation.amountMicroUsd,
        upstreamResponse,
        upstreamBody,
      );

      if (!upstreamResponse.ok) {
        await input.ledger.record({
          agentId: authorization.agent.id,
          httpStatus: upstreamResponse.status,
          model: body.model,
          requestId,
          type: "UPSTREAM_ERROR",
        });
      }

      copyResponseHeaders(response, upstreamResponse);
      response.statusCode = upstreamResponse.status;
      response.end(upstreamBody);
    } catch (error) {
      await input.budgets.release(authorization.reservation.id);
      await input.ledger.record({
        agentId: authorization.agent.id,
        model: body.model,
        reasonCode: abortController.signal.aborted
          ? "UPSTREAM_TIMEOUT"
          : "UPSTREAM_ERROR",
        requestId,
        type: "UPSTREAM_ERROR",
      });
      if (abortController.signal.aborted) {
        sendError(response, 504, "UPSTREAM_TIMEOUT", "The upstream request timed out.");
        return;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      request.off("aborted", abortOnClientClose);
      response.off("close", abortOnClientClose);
    }
  } catch (error) {
    if (error instanceof InvalidAgentTokenError) {
      sendError(response, 401, error.code, error.message);
      return;
    }
    if (error instanceof GuardAuthorizationError) {
      const status =
        error.code === "DAILY_BUDGET_EXCEEDED" ||
        error.code === "REQUEST_LIMIT_EXCEEDED"
          ? 429
          : error.code === "INVALID_AGENT_TOKEN"
            ? 401
            : 403;
      sendError(response, status, error.code, error.message);
      return;
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      sendError(response, 400, "INVALID_REQUEST", "Request body is invalid.");
      return;
    }
    if (error instanceof BodyTooLargeError) {
      sendError(response, 413, "BODY_TOO_LARGE", error.message);
      return;
    }

    sendError(response, 502, "UPSTREAM_ERROR", "The upstream request failed.");
  }
}

async function streamUpstreamResponse(input: {
  authorization: Awaited<ReturnType<GuardRequestAuthorizer["authorize"]>>;
  budgets: BudgetService;
  response: ServerResponse;
  upstreamResponse: Response;
}): Promise<void> {
  copyResponseHeaders(input.response, input.upstreamResponse);
  input.response.statusCode = input.upstreamResponse.status;
  let captured = "";
  const decoder = new TextDecoder();

  for await (const chunk of input.upstreamResponse.body!) {
    if (!input.response.write(chunk)) {
      await new Promise<void>((resolve) => input.response.once("drain", resolve));
    }
    captured += decoder.decode(chunk, { stream: true });
    if (captured.length > 2_000_000) {
      captured = captured.slice(-2_000_000);
    }
  }
  captured += decoder.decode();

  await input.budgets.confirm(
    input.authorization.reservation.id,
    extractStreamCostMicroUsd(captured) ??
      input.authorization.reservation.amountMicroUsd,
  );
  input.response.end();
}

async function reconcileBufferedResponse(
  budgets: BudgetService,
  reservationId: string,
  reservationAmountMicroUsd: string,
  upstreamResponse: Response,
  upstreamBody: string,
): Promise<void> {
  const confirmedCost = extractCostMicroUsd(upstreamBody);
  if (confirmedCost !== undefined) {
    await budgets.confirm(reservationId, confirmedCost);
  } else if (upstreamResponse.ok) {
    await budgets.confirm(reservationId, reservationAmountMicroUsd);
  } else {
    await budgets.release(reservationId);
  }
}

function upstreamHeaders(request: IncomingMessage, key: string): HeadersInit {
  const headers: Record<string, string> = {
    accept: request.headers.accept ?? "application/json",
    authorization: `Bearer ${key}`,
    "content-type": "application/json",
  };
  const anthropicVersion = request.headers["anthropic-version"];
  if (typeof anthropicVersion === "string") {
    headers["anthropic-version"] = anthropicVersion;
  }
  return headers;
}

function copyResponseHeaders(
  response: ServerResponse,
  upstreamResponse: Response,
): void {
  response.setHeader(
    "content-type",
    upstreamResponse.headers.get("content-type") ?? "application/json",
  );
  const upstreamRequestId = upstreamResponse.headers.get("x-request-id");
  if (upstreamRequestId) {
    response.setHeader("x-request-id", upstreamRequestId);
  }
  const cacheControl = upstreamResponse.headers.get("cache-control");
  if (cacheControl) {
    response.setHeader("cache-control", cacheControl);
  }
}

function bearerToken(
  authorization: string | undefined,
  apiKey: string | string[] | undefined,
): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1] ?? (Array.isArray(apiKey) ? apiKey[0] : apiKey);
  if (!token) {
    throw new InvalidAgentTokenError();
  }
  return token;
}

async function readBody(request: IncomingMessage, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > maxBytes) {
      throw new BodyTooLargeError(`Request body exceeds ${maxBytes} bytes.`);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function withTrailingSlash(url: URL): URL {
  return new URL(url.pathname.endsWith("/") ? url.toString() : `${url.toString()}/`);
}

function sendError(
  response: ServerResponse,
  status: number,
  code: string,
  message: string,
): void {
  if (response.headersSent || response.destroyed) {
    return;
  }
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.end(
    JSON.stringify({
      error: {
        code,
        message,
        type: "orbio_guard_error",
      },
    }),
  );
}

class BodyTooLargeError extends Error {}
