import type { GuardConfig } from "../config/schema.js";
import { formatMicroUsd, parseMicroUsd } from "../domain/money.js";
import type { LedgerEvent } from "../domain/ledger.js";
import { connectOrbioMcp } from "../orbio/mcp-client.js";
import {
  orbioBalanceSchema,
  orbioKeyStatusSchema,
  parseStructuredToolResult,
} from "../orbio/results.js";
import type { GuardState } from "../state/schema.js";
import { GuardStateStore } from "../state/store.js";
import { UpstreamKeyStore } from "../upstream/key-store.js";

export interface DashboardSnapshot {
  activity: LedgerEvent[];
  agents: Array<{
    allowedModels: string[];
    budgetPercent: number;
    confirmedUsd: string;
    dailyBudgetUsd: string;
    id: string;
    maxRequestUsd: string | null;
    name: string;
    project: string | null;
    reservedUsd: string;
    status: string;
    tokenFingerprint: string;
  }>;
  generatedAt: string;
  mode: "demo" | "live";
  key: {
    configured: boolean;
    fingerprint?: string;
    remoteCreatedAt?: string | null;
    remoteHasKey?: boolean;
    remoteLastUsedAt?: string | null;
    remotePrefix?: string | null;
  };
  remote: {
    balanceUsd?: number;
    claimedUsd?: number;
    error?: string;
    spentUsd?: number;
    wallets?: string[];
  };
  summary: {
    activeAgents: number;
    confirmedTodayUsd: string;
    disabledAgents: number;
    reservedTodayUsd: string;
    totalAgents: number;
  };
}

export class DashboardService {
  constructor(
    private readonly config: GuardConfig,
    private readonly store = new GuardStateStore(config.stateDirectory),
    private readonly keyStore = new UpstreamKeyStore(config.stateDirectory),
  ) {}

  async snapshot(includeRemote: boolean): Promise<DashboardSnapshot> {
    const state = await this.store.read();
    const keyStatus = await this.keyStore.status();
    const date = new Date().toISOString().slice(0, 10);
    const agents = state.agents.map((agent) => {
      const budget = state.budgets.find(
        (candidate) => candidate.agentId === agent.id && candidate.date === date,
      );
      const confirmed = parseMicroUsd(budget?.confirmedMicroUsd ?? "0");
      const reserved =
        budget?.reservations.reduce(
          (total, reservation) =>
            total + parseMicroUsd(reservation.amountMicroUsd),
          0n,
        ) ?? 0n;
      const limit = parseMicroUsd(agent.dailyBudgetMicroUsd);
      const budgetPercent =
        limit === 0n
          ? confirmed + reserved > 0n
            ? 100
            : 0
          : Math.min(100, Number(((confirmed + reserved) * 10_000n) / limit) / 100);

      return {
        allowedModels: agent.allowedModels,
        budgetPercent,
        confirmedUsd: formatMicroUsd(confirmed.toString()),
        dailyBudgetUsd: formatMicroUsd(agent.dailyBudgetMicroUsd),
        id: agent.id,
        maxRequestUsd:
          agent.maxRequestMicroUsd === null
            ? null
            : formatMicroUsd(agent.maxRequestMicroUsd),
        name: agent.name,
        project: agent.project,
        reservedUsd: formatMicroUsd(reserved.toString()),
        status: agent.status,
        tokenFingerprint: agent.tokenHash.slice(0, 12),
      };
    });
    const confirmedToday = agents.reduce(
      (total, agent) => total + parseUsd(agent.confirmedUsd),
      0,
    );
    const reservedToday = agents.reduce(
      (total, agent) => total + parseUsd(agent.reservedUsd),
      0,
    );
    const snapshot: DashboardSnapshot = {
      activity: state.ledger.slice(-80).reverse(),
      agents,
      generatedAt: new Date().toISOString(),
      mode: this.config.displayMode,
      key: keyStatus.configured
        ? {
            configured: true,
            fingerprint: keyStatus.fingerprint,
          }
        : { configured: false },
      remote: {},
      summary: {
        activeAgents: agents.filter((agent) => agent.status === "active").length,
        confirmedTodayUsd: formatNumber(confirmedToday),
        disabledAgents: agents.filter((agent) => agent.status === "disabled").length,
        reservedTodayUsd: formatNumber(reservedToday),
        totalAgents: agents.length,
      },
    };

    if (includeRemote && this.config.displayMode === "demo") {
      snapshot.remote = {
        balanceUsd: 100,
        claimedUsd: 100,
        spentUsd: 0.35,
        wallets: ["0xDemo…Guard"],
      };
      snapshot.key = {
        ...snapshot.key,
        remoteCreatedAt: snapshot.generatedAt,
        remoteHasKey: true,
        remoteLastUsedAt: snapshot.generatedAt,
        remotePrefix: "sk-orbio-demo",
      };
    } else if (includeRemote) {
      await this.attachRemote(snapshot);
    }

    return snapshot;
  }

  private async attachRemote(snapshot: DashboardSnapshot): Promise<void> {
    try {
      const session = await connectOrbioMcp(this.config, { interactive: false });
      try {
        const balance = parseStructuredToolResult(
          await session.callTool("orbio_get_balance"),
          orbioBalanceSchema,
        );
        const keyStatus = parseStructuredToolResult(
          await session.callTool("orbio_get_key_status"),
          orbioKeyStatusSchema,
        );
        snapshot.remote = {
          balanceUsd: balance.balance.usd,
          claimedUsd: balance.claimed.usd,
          spentUsd: balance.spent.usd,
          wallets: balance.wallets.map(maskWallet),
        };
        snapshot.key = {
          ...snapshot.key,
          remoteCreatedAt: keyStatus.createdAt,
          remoteHasKey: keyStatus.hasKey,
          remoteLastUsedAt: keyStatus.lastUsedAt,
          remotePrefix: keyStatus.prefix,
        };
      } finally {
        await session.close();
      }
    } catch (error) {
      snapshot.remote = {
        error: error instanceof Error ? error.message : "Remote status unavailable.",
      };
    }
  }
}

function maskWallet(wallet: string): string {
  return wallet.length > 12
    ? `${wallet.slice(0, 6)}…${wallet.slice(-4)}`
    : wallet;
}

function parseUsd(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number): string {
  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") || "0";
}
