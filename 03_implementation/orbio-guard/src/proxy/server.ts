import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { z } from "zod";
import { GuardRequestAuthorizer, GuardAuthorizationError } from "../control/authorizer.js";
import { GuardControlService, InvalidAgentTokenError } from "../control/service.js";
import { BudgetService } from "../domain/budget.js";
import type { GuardConfig } from "../config/schema.js";
import { GuardStateStore } from "../state/store.js";
import { UpstreamKeyStore } from "../upstream/key-store.js";
import { extractCostMicroUsd } from "./usage.js";

const chatCompletionSchema = z
  .object({
    model: z.string().min(1),
    messages: z.array(z.unknown()).min(1),
    stream: z.boolean().optional(),
  })
  .loose();

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
  const authorizer = new GuardRequestAuthorizer(control, budgets);
  const keyStore = new UpstreamKeyStore(config.stateDirectory);

  await keyStore.load();

  const server = createServer((request, response) => {
    void handleRequest({
      authorizer,
      budgets,
      config,
      control,
      fetchImplementation,
      keyStore,
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
  fetchImplementation: typeof fetch;
  keyStore: UpstreamKeyStore;
  request: IncomingMessage;
  response: ServerResponse;
}): Promise<void> {
  const { request, response } = input;

  try {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      sendError(response, 404, "NOT_FOUND", "Endpoint not found.");
      return;
    }

    const agentToken = bearerToken(request.headers.authorization);
    const bodyText = await readBody(request, input.config.maxBodyBytes);
    const body = chatCompletionSchema.parse(JSON.parse(bodyText));

    if (body.stream) {
      sendError(
        response,
        400,
        "STREAMING_NOT_SUPPORTED",
        "Streaming is not supported in the current MVP proxy.",
      );
      return;
    }

    const agent = await input.control.authenticateAgent(agentToken);
    const estimatedCostMicroUsd =
      agent.maxRequestMicroUsd ?? input.config.defaultReservationMicroUsd;
    const credentials = await input.keyStore.load();
    const authorization = await input.authorizer.authorize({
      agentToken,
      estimatedCostMicroUsd,
      model: body.model,
    });
    const abortController = new AbortController();
    const timeout = setTimeout(
      () => abortController.abort(new Error("Upstream request timed out.")),
      input.config.requestTimeoutMs,
    );
    const abortOnClientClose = () => abortController.abort();
    request.once("aborted", abortOnClientClose);

    try {
      const upstreamResponse = await input.fetchImplementation(
        new URL("chat/completions", withTrailingSlash(credentials.baseUrl)),
        {
          body: bodyText,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${credentials.key}`,
            "content-type": "application/json",
          },
          method: "POST",
          signal: abortController.signal,
        },
      );
      const upstreamBody = await upstreamResponse.text();
      const confirmedCost = extractCostMicroUsd(upstreamBody);

      if (confirmedCost !== undefined) {
        await input.budgets.confirm(authorization.reservation.id, confirmedCost);
      } else if (upstreamResponse.ok) {
        await input.budgets.confirm(
          authorization.reservation.id,
          authorization.reservation.amountMicroUsd,
        );
      } else {
        await input.budgets.release(authorization.reservation.id);
      }

      response.statusCode = upstreamResponse.status;
      response.setHeader(
        "content-type",
        upstreamResponse.headers.get("content-type") ?? "application/json",
      );
      const requestId = upstreamResponse.headers.get("x-request-id");
      if (requestId) {
        response.setHeader("x-request-id", requestId);
      }
      response.end(upstreamBody);
    } catch (error) {
      await input.budgets.release(authorization.reservation.id);
      if (abortController.signal.aborted) {
        sendError(response, 504, "UPSTREAM_TIMEOUT", "The upstream request timed out.");
        return;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      request.off("aborted", abortOnClientClose);
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

function bearerToken(header: string | undefined): string {
  const match = header?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) {
    throw new InvalidAgentTokenError();
  }
  return match[1];
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
