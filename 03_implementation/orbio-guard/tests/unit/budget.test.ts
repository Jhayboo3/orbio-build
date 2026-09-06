import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BudgetExceededError,
  BudgetService,
} from "../../src/domain/budget.js";
import { GuardStateStore } from "../../src/state/store.js";

describe("BudgetService", () => {
  it("serializes concurrent reservations against one daily limit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-budget-"));
    const service = new BudgetService(
      new GuardStateStore(directory),
      () => new Date("2026-09-06T12:00:00.000Z"),
    );

    const attempts = await Promise.allSettled([
      service.reserve({
        agentId: "agent-1",
        amountMicroUsd: "700000",
        dailyLimitMicroUsd: "1000000",
      }),
      service.reserve({
        agentId: "agent-1",
        amountMicroUsd: "700000",
        dailyLimitMicroUsd: "1000000",
      }),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    const rejection = attempts.find((attempt) => attempt.status === "rejected");
    expect(rejection?.status === "rejected" && rejection.reason).toBeInstanceOf(
      BudgetExceededError,
    );
  });

  it("confirms, releases, and rolls over by UTC date", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-budget-"));
    let now = new Date("2026-09-06T23:59:00.000Z");
    const service = new BudgetService(
      new GuardStateStore(directory),
      () => now,
    );
    const confirmed = await service.reserve({
      agentId: "agent-1",
      amountMicroUsd: "400000",
      dailyLimitMicroUsd: "1000000",
    });
    const released = await service.reserve({
      agentId: "agent-1",
      amountMicroUsd: "100000",
      dailyLimitMicroUsd: "1000000",
    });

    await service.confirm(confirmed.id, "350000");
    await service.release(released.id);
    expect(await service.usage("agent-1")).toMatchObject({
      date: "2026-09-06",
      confirmedMicroUsd: "350000",
      reservedMicroUsd: "0",
    });

    now = new Date("2026-09-07T00:01:00.000Z");
    expect(await service.usage("agent-1")).toMatchObject({
      date: "2026-09-07",
      confirmedMicroUsd: "0",
      reservedMicroUsd: "0",
    });
  });

  it("conservatively confirms stale reservations after a crash", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-budget-"));
    let now = new Date("2026-09-06T12:00:00.000Z");
    const store = new GuardStateStore(directory);
    const service = new BudgetService(store, () => now);
    await service.reserve({
      agentId: "agent-1",
      amountMicroUsd: "400000",
      dailyLimitMicroUsd: "1000000",
    });
    now = new Date("2026-09-06T12:10:00.000Z");

    await expect(
      service.recoverStaleReservations({ maxAgeMs: 300_000, policy: "confirm" }),
    ).resolves.toEqual({ amountMicroUsd: "400000", recovered: 1 });
    expect(await service.usage("agent-1")).toMatchObject({
      confirmedMicroUsd: "400000",
      reservedMicroUsd: "0",
    });
    expect((await store.read()).ledger.at(-1)).toMatchObject({
      reasonCode: "STALE_RESERVATION_CONFIRMED",
      type: "RESERVATION_RECOVERED",
    });
  });

  it("can release stale reservations while retaining fresh ones", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-budget-"));
    let now = new Date("2026-09-06T12:00:00.000Z");
    const service = new BudgetService(
      new GuardStateStore(directory),
      () => now,
    );
    await service.reserve({
      agentId: "agent-1",
      amountMicroUsd: "300000",
      dailyLimitMicroUsd: "1000000",
    });
    now = new Date("2026-09-06T12:06:00.000Z");
    await service.reserve({
      agentId: "agent-1",
      amountMicroUsd: "200000",
      dailyLimitMicroUsd: "1000000",
    });

    await expect(
      service.recoverStaleReservations({ maxAgeMs: 300_000, policy: "release" }),
    ).resolves.toEqual({ amountMicroUsd: "300000", recovered: 1 });
    expect(await service.usage("agent-1")).toMatchObject({
      confirmedMicroUsd: "0",
      reservedMicroUsd: "200000",
    });
  });
});
