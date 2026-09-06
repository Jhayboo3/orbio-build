import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { GuardConfig } from "../../src/config/schema.js";
import { LedgerService } from "../../src/domain/ledger.js";
import { OrbioKeyLifecycleService } from "../../src/orbio/key-lifecycle.js";
import type { OrbioMcpSession } from "../../src/orbio/mcp-client.js";
import { GuardStateStore } from "../../src/state/store.js";
import { UpstreamKeyStore } from "../../src/upstream/key-store.js";

describe("OrbioKeyLifecycleService", () => {
  it("creates and stores a new key without exposing it in the ledger", async () => {
    const setup = await createSetup(false);
    const result = await setup.service.createOrRotate({
      allowRotation: false,
      label: "Test Guard",
    });

    expect(result.rotated).toBe(false);
    expect((await setup.keyStore.load()).key).toBe("or-synthetic-created-key");
    expect(JSON.stringify(await setup.ledger.list())).not.toContain(
      "or-synthetic-created-key",
    );
    expect(setup.callTool).toHaveBeenCalledWith("orbio_create_key", {
      label: "Test Guard",
    });
  });

  it("requires explicit rotation when a current key exists", async () => {
    const setup = await createSetup(true);
    await expect(
      setup.service.createOrRotate({ allowRotation: false }),
    ).rejects.toThrow("--rotate");
    expect(setup.callTool).not.toHaveBeenCalledWith(
      "orbio_create_key",
      expect.anything(),
    );
  });

  it("revokes upstream and removes the local key", async () => {
    const setup = await createSetup(false);
    await setup.keyStore.save(
      "or-synthetic-existing-key",
      new URL("https://orbio.so/api/v1"),
    );

    await setup.service.revoke();

    await expect(setup.keyStore.status()).resolves.toEqual({ configured: false });
    expect(setup.callTool).toHaveBeenCalledWith("orbio_revoke_key");
  });
});

async function createSetup(hasKey: boolean) {
  const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-key-life-"));
  const config: GuardConfig = {
    defaultReservationMicroUsd: "250000",
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
    upstreamBaseUrl: new URL("https://orbio.so/api/v1"),
  };
  const keyStore = new UpstreamKeyStore(stateDirectory);
  const ledger = new LedgerService(new GuardStateStore(stateDirectory));
  const callTool = vi.fn(async (name: string) => {
    if (name === "orbio_get_key_status") {
      return {
        structuredContent: {
          hasKey,
          prefix: hasKey ? "or-live" : null,
          createdAt: hasKey ? "2026-09-06T00:00:00.000Z" : null,
          lastUsedAt: null,
          baseUrl: "https://orbio.so/api/v1",
          legacy: null,
        },
      };
    }
    if (name === "orbio_create_key") {
      return {
        structuredContent: {
          key: "or-synthetic-created-key",
          baseUrl: "https://orbio.so/api/v1",
        },
      };
    }
    return { structuredContent: { revoked: true } };
  });
  const session: OrbioMcpSession = {
    callTool,
    close: vi.fn(async () => undefined),
    listTools: vi.fn(async () => []),
  };
  const service = new OrbioKeyLifecycleService(
    config,
    keyStore,
    ledger,
    async () => session,
  );
  return { callTool, keyStore, ledger, service };
}
