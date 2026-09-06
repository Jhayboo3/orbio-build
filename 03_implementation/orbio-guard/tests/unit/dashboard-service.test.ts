import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GuardConfig } from "../../src/config/schema.js";
import { GuardControlService } from "../../src/control/service.js";
import { DashboardService } from "../../src/dashboard/service.js";
import { BudgetService } from "../../src/domain/budget.js";
import { GuardStateStore } from "../../src/state/store.js";
import { UpstreamKeyStore } from "../../src/upstream/key-store.js";

describe("DashboardService", () => {
  it("aggregates agent budgets without exposing token hashes or keys", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-dashboard-"));
    const store = new GuardStateStore(stateDirectory);
    const control = new GuardControlService(store);
    const created = await control.addAgent({
      allowedModels: ["openai/*"],
      dailyBudgetMicroUsd: "1000000",
      name: "Dashboard agent",
    });
    const budgets = new BudgetService(store, () => new Date());
    const reservation = await budgets.reserve({
      agentId: created.agent.id,
      amountMicroUsd: "250000",
      dailyLimitMicroUsd: "1000000",
    });
    await budgets.confirm(reservation.id, "200000");
    const config = createConfig(stateDirectory);
    const snapshot = await new DashboardService(
      config,
      store,
      new UpstreamKeyStore(stateDirectory),
    ).snapshot(false);

    expect(snapshot.agents[0]).toMatchObject({
      budgetPercent: 20,
      confirmedUsd: "0.2",
      dailyBudgetUsd: "1",
    });
    expect(JSON.stringify(snapshot)).not.toContain(created.token);
    expect(snapshot.agents[0]).not.toHaveProperty("tokenHash");
  });

  it("uses clearly labeled synthetic remote data in demo mode", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-dashboard-"));
    const config = createConfig(stateDirectory);
    config.displayMode = "demo";
    const snapshot = await new DashboardService(config).snapshot(true);

    expect(snapshot).toMatchObject({
      mode: "demo",
      remote: {
        balanceUsd: 100,
        wallets: ["0xDemo…Guard"],
      },
      key: {
        remoteHasKey: true,
        remotePrefix: "sk-orbio-demo",
      },
    });
  });
});

function createConfig(stateDirectory: string): GuardConfig {
  return {
    defaultReservationMicroUsd: "250000",
    displayMode: "live",
    host: "127.0.0.1",
    maxBodyBytes: 1_048_576,
    mcpEndpoint: new URL("https://www.orbio.so/api/mcp"),
    oauthCallbackBindHost: "127.0.0.1",
    oauthCallbackHost: "127.0.0.1",
    oauthCallbackPort: 4319,
    oauthTimeoutMs: 180_000,
    port: 4318,
    requestTimeoutMs: 15_000,
    reservationTtlMs: 300_000,
    stateDirectory,
    staleReservationPolicy: "confirm",
    upstreamBaseUrl: new URL("https://www.orbio.so/api/v1"),
  };
}
