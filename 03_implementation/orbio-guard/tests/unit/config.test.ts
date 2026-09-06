import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/schema.js";

describe("loadConfig", () => {
  it("loads secure local defaults", () => {
    const config = loadConfig({});

    expect(config.host).toBe("127.0.0.1");
    expect(config.displayMode).toBe("live");
    expect(config.mcpEndpoint.toString()).toBe("https://www.orbio.so/api/mcp");
    expect(config.port).toBe(4318);
    expect(config.reservationTtlMs).toBe(300_000);
    expect(config.staleReservationPolicy).toBe("confirm");
    expect(config.stateDirectory).toContain(".orbio-guard");
  });

  it("rejects an invalid port", () => {
    expect(() => loadConfig({ ORBIO_GUARD_PORT: "70000" })).toThrow();
  });
});
