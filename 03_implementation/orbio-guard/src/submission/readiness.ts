import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { GuardConfig } from "../config/schema.js";
import { OAuthStateStore } from "../auth/oauth-store.js";
import { connectOrbioMcp } from "../orbio/mcp-client.js";
import {
  orbioBalanceSchema,
  orbioKeyStatusSchema,
  parseStructuredToolResult,
} from "../orbio/results.js";
import { GuardStateStore } from "../state/store.js";
import { UpstreamKeyStore } from "../upstream/key-store.js";

export type ReadinessStatus = "block" | "pass" | "warn";

export interface ReadinessCheck {
  id: string;
  message: string;
  status: ReadinessStatus;
}

export interface SubmissionReadiness {
  checks: ReadinessCheck[];
  generatedAt: string;
  ready: boolean;
}

export interface RemoteReadiness {
  hasKey: boolean;
  spendableCredit: boolean;
}

export interface SubmissionReadinessDependencies {
  oauthStore?: OAuthStateStore;
  keyStore?: UpstreamKeyStore;
  loadRemote?: () => Promise<RemoteReadiness>;
  stateStore?: GuardStateStore;
}

export class SubmissionReadinessService {
  private readonly oauthStore: OAuthStateStore;
  private readonly keyStore: UpstreamKeyStore;
  private readonly loadRemote: () => Promise<RemoteReadiness>;
  private readonly stateStore: GuardStateStore;

  constructor(
    private readonly config: GuardConfig,
    dependencies: SubmissionReadinessDependencies = {},
  ) {
    this.oauthStore =
      dependencies.oauthStore ?? new OAuthStateStore(config.stateDirectory);
    this.keyStore =
      dependencies.keyStore ?? new UpstreamKeyStore(config.stateDirectory);
    this.stateStore =
      dependencies.stateStore ?? new GuardStateStore(config.stateDirectory);
    this.loadRemote = dependencies.loadRemote ?? (() => loadRemoteStatus(config));
  }

  async check(): Promise<SubmissionReadiness> {
    const checks: ReadinessCheck[] = [];
    const oauth = await this.oauthStore.read();
    checks.push(
      oauth.tokens?.access_token
        ? pass("oauth", "Orbio OAuth credentials are configured.")
        : block("oauth", "Orbio OAuth is missing; run `orbio-guard auth`."),
    );

    const keyStatus = await this.keyStore.status();
    checks.push(
      keyStatus.configured
        ? pass("upstream_key", "The local upstream key vault is configured.")
        : block(
            "upstream_key",
            "The upstream key is missing; create or import an Orbio key.",
          ),
    );

    const state = await this.stateStore.read();
    const activeAgents = state.agents.filter((agent) => agent.status === "active");
    checks.push(
      activeAgents.length > 0
        ? pass("active_agents", `${activeAgents.length} active Guard agent(s) configured.`)
        : warn(
            "active_agents",
            "No persistent live Guard agent is active; demo mode creates temporary agents.",
          ),
    );

    checks.push(...(await permissionChecks(this.config.stateDirectory)));

    if (oauth.tokens?.access_token) {
      try {
        const remote = await this.loadRemote();
        checks.push(
          remote.hasKey
            ? pass("remote_key", "Orbio reports an active account gateway key.")
            : block("remote_key", "Orbio reports no active account gateway key."),
        );
        checks.push(
          remote.spendableCredit
            ? pass("credit", "The Orbio account has spendable inference credit.")
            : block(
                "credit",
                "The Orbio account has no spendable inference credit.",
              ),
        );
      } catch (error) {
        checks.push(
          block(
            "remote_status",
            `Remote Orbio readiness failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }
    }

    return {
      checks,
      generatedAt: new Date().toISOString(),
      ready: checks.every((check) => check.status !== "block"),
    };
  }
}

async function loadRemoteStatus(config: GuardConfig): Promise<RemoteReadiness> {
  const session = await connectOrbioMcp(config, { interactive: false });
  try {
    const balance = parseStructuredToolResult(
      await session.callTool("orbio_get_balance"),
      orbioBalanceSchema,
    );
    const key = parseStructuredToolResult(
      await session.callTool("orbio_get_key_status"),
      orbioKeyStatusSchema,
    );
    return {
      hasKey: key.hasKey,
      spendableCredit: balance.balance.usd > 0,
    };
  } finally {
    await session.close();
  }
}

async function permissionChecks(stateDirectory: string): Promise<ReadinessCheck[]> {
  const files = ["oauth.json", "upstream.json", "guard.json"];
  const checks: ReadinessCheck[] = [];
  for (const file of files) {
    try {
      const mode = (await stat(join(stateDirectory, file))).mode & 0o777;
      checks.push(
        mode === 0o600
          ? pass(`permissions_${file}`, `${file} uses owner-only permissions.`)
          : block(
              `permissions_${file}`,
              `${file} permissions are ${mode.toString(8)}; expected 600.`,
            ),
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        checks.push(warn(`permissions_${file}`, `${file} does not exist yet.`));
        continue;
      }
      throw error;
    }
  }
  return checks;
}

function pass(id: string, message: string): ReadinessCheck {
  return { id, message, status: "pass" };
}

function warn(id: string, message: string): ReadinessCheck {
  return { id, message, status: "warn" };
}

function block(id: string, message: string): ReadinessCheck {
  return { id, message, status: "block" };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
