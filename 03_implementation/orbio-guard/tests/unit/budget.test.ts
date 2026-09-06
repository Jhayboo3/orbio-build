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
});
