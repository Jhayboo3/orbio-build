import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LedgerService } from "../../src/domain/ledger.js";
import { GuardStateStore } from "../../src/state/store.js";

describe("LedgerService", () => {
  it("stores metadata-only events newest first", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-ledger-"));
    const store = new GuardStateStore(directory);
    let now = new Date("2026-09-06T12:00:00.000Z");
    const ledger = new LedgerService(store, () => now);

    await ledger.record({
      agentId: "agent-1",
      model: "openai/gpt-test",
      type: "REQUEST_ALLOWED",
    });
    now = new Date("2026-09-06T12:01:00.000Z");
    await ledger.record({
      agentId: "agent-1",
      reasonCode: "UPSTREAM_ERROR",
      type: "UPSTREAM_ERROR",
    });

    const events = await ledger.list();
    expect(events.map((event) => event.type)).toEqual([
      "UPSTREAM_ERROR",
      "REQUEST_ALLOWED",
    ]);
    expect(JSON.stringify(events)).not.toContain("prompt");
    expect(JSON.stringify(events)).not.toContain("authorization");
  });
});
