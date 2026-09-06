import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { parseUsdToMicroUsd } from "../domain/money.js";

const DEFAULT_MCP_ENDPOINT = "https://www.orbio.so/api/mcp";

const environmentSchema = z.object({
  ORBIO_GUARD_MCP_ENDPOINT: z.url().default(DEFAULT_MCP_ENDPOINT),
  ORBIO_GUARD_HOST: z.string().min(1).default("127.0.0.1"),
  ORBIO_GUARD_PORT: z.coerce.number().int().min(1).max(65_535).default(4_318),
  ORBIO_GUARD_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(120_000)
    .default(15_000),
  ORBIO_GUARD_OAUTH_CALLBACK_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65_535)
    .default(4_319),
  ORBIO_GUARD_OAUTH_CALLBACK_BIND_HOST: z.string().min(1).default("127.0.0.1"),
  ORBIO_GUARD_OAUTH_CALLBACK_HOST: z.string().min(1).default("127.0.0.1"),
  ORBIO_GUARD_OAUTH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .max(600_000)
    .default(180_000),
  ORBIO_GUARD_UPSTREAM_BASE_URL: z.url().default("https://www.orbio.so/api/v1"),
  ORBIO_GUARD_DEFAULT_RESERVATION_USD: z.string().default("0.25"),
  ORBIO_GUARD_MAX_BODY_BYTES: z.coerce
    .number()
    .int()
    .min(1_024)
    .max(10_485_760)
    .default(1_048_576),
  ORBIO_GUARD_RESERVATION_TTL_MS: z.coerce
    .number()
    .int()
    .min(30_000)
    .max(86_400_000)
    .default(300_000),
  ORBIO_GUARD_STALE_RESERVATION_POLICY: z
    .enum(["confirm", "release"])
    .default("confirm"),
  ORBIO_GUARD_MODE: z.enum(["live", "demo"]).default("live"),
  ORBIO_GUARD_STATE_DIR: z.string().min(1).optional(),
});

export interface GuardConfig {
  defaultReservationMicroUsd: string;
  displayMode: "demo" | "live";
  host: string;
  maxBodyBytes: number;
  mcpEndpoint: URL;
  oauthCallbackPort: number;
  oauthCallbackBindHost: string;
  oauthCallbackHost: string;
  oauthTimeoutMs: number;
  port: number;
  requestTimeoutMs: number;
  reservationTtlMs: number;
  stateDirectory: string;
  staleReservationPolicy: "confirm" | "release";
  upstreamBaseUrl: URL;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GuardConfig {
  const parsed = environmentSchema.parse(environment);

  return {
    defaultReservationMicroUsd: parseUsdToMicroUsd(
      parsed.ORBIO_GUARD_DEFAULT_RESERVATION_USD,
    ),
    displayMode: parsed.ORBIO_GUARD_MODE,
    host: parsed.ORBIO_GUARD_HOST,
    maxBodyBytes: parsed.ORBIO_GUARD_MAX_BODY_BYTES,
    mcpEndpoint: new URL(parsed.ORBIO_GUARD_MCP_ENDPOINT),
    oauthCallbackBindHost: parsed.ORBIO_GUARD_OAUTH_CALLBACK_BIND_HOST,
    oauthCallbackHost: parsed.ORBIO_GUARD_OAUTH_CALLBACK_HOST,
    oauthCallbackPort: parsed.ORBIO_GUARD_OAUTH_CALLBACK_PORT,
    oauthTimeoutMs: parsed.ORBIO_GUARD_OAUTH_TIMEOUT_MS,
    port: parsed.ORBIO_GUARD_PORT,
    requestTimeoutMs: parsed.ORBIO_GUARD_REQUEST_TIMEOUT_MS,
    reservationTtlMs: parsed.ORBIO_GUARD_RESERVATION_TTL_MS,
    stateDirectory: parsed.ORBIO_GUARD_STATE_DIR
      ? resolve(parsed.ORBIO_GUARD_STATE_DIR)
      : join(homedir(), ".orbio-guard"),
    staleReservationPolicy: parsed.ORBIO_GUARD_STALE_RESERVATION_POLICY,
    upstreamBaseUrl: new URL(parsed.ORBIO_GUARD_UPSTREAM_BASE_URL),
  };
}
