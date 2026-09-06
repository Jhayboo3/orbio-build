import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";

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
  ORBIO_GUARD_STATE_DIR: z.string().min(1).optional(),
});

export interface GuardConfig {
  host: string;
  mcpEndpoint: URL;
  port: number;
  requestTimeoutMs: number;
  stateDirectory: string;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GuardConfig {
  const parsed = environmentSchema.parse(environment);

  return {
    host: parsed.ORBIO_GUARD_HOST,
    mcpEndpoint: new URL(parsed.ORBIO_GUARD_MCP_ENDPOINT),
    port: parsed.ORBIO_GUARD_PORT,
    requestTimeoutMs: parsed.ORBIO_GUARD_REQUEST_TIMEOUT_MS,
    stateDirectory: parsed.ORBIO_GUARD_STATE_DIR
      ? resolve(parsed.ORBIO_GUARD_STATE_DIR)
      : join(homedir(), ".orbio-guard"),
  };
}
