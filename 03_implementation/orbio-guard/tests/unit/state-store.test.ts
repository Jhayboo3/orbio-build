import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GuardControlService } from "../../src/control/service.js";
import { GuardStateStore } from "../../src/state/store.js";
import { LedgerService } from "../../src/domain/ledger.js";

describe("GuardStateStore and control service", () => {
  it("persists agents with owner-only permissions and no raw token", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-state-"));
    const store = new GuardStateStore(directory);
    const service = new GuardControlService(store);
    const created = await service.addAgent({
      allowedModels: ["*"],
      dailyBudgetMicroUsd: "5000000",
      name: "Test agent",
    });

    const state = await store.read();
    expect(state.agents).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain(created.token);
    expect((await stat(store.filePath)).mode & 0o777).toBe(0o600);
  });

  it("rotates credentials and updates agent status", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-state-"));
    const service = new GuardControlService(new GuardStateStore(directory));
    const created = await service.addAgent({
      allowedModels: ["*"],
      dailyBudgetMicroUsd: "5000000",
      name: "Test agent",
    });
    const rotated = await service.rotateToken(created.agent.id);
    const disabled = await service.setStatus(created.agent.id, "disabled");

    expect(rotated.token).not.toBe(created.token);
    expect(disabled.status).toBe("disabled");
  });

  it("serializes updates across separate store instances", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-state-"));
    const ledgers = [
      new LedgerService(new GuardStateStore(directory)),
      new LedgerService(new GuardStateStore(directory)),
    ];

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        ledgers[index % ledgers.length]!.record({
          reasonCode: `event-${index}`,
          type: "UPSTREAM_ERROR",
        }),
      ),
    );

    const state = await new GuardStateStore(directory).read();
    expect(state.ledger).toHaveLength(20);
    expect(state.ledger.map((event) => event.reasonCode).sort()).toEqual(
      Array.from({ length: 20 }, (_, index) => `event-${index}`).sort(),
    );
  });
});
