import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { GuardConfig } from "../../src/config/schema.js";
import { OAuthStateStore } from "../../src/auth/oauth-store.js";
import { SubmissionReadinessService } from "../../src/submission/readiness.js";
import { GuardStateStore } from "../../src/state/store.js";
import { UpstreamKeyStore } from "../../src/upstream/key-store.js";

describe("SubmissionReadinessService", () => {
  it("reports a ready live configuration without exposing values", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-readiness-"));
    const config = createConfig(stateDirectory);
    const oauthStore = new OAuthStateStore(stateDirectory);
    const keyStore = new UpstreamKeyStore(stateDirectory);
    const stateStore = new GuardStateStore(stateDirectory);
    await oauthStore.update({
      tokens: { access_token: "oauth-secret", token_type: "Bearer" },
    });
    await keyStore.save(
      "sk-orbio-synthetic-readiness-key",
      new URL("https://www.orbio.so/api/v1"),
    );
    await stateStore.update(() => undefined);

    const result = await new SubmissionReadinessService(config, {
      keyStore,
      loadRemote: async () => ({ hasKey: true, spendableCredit: true }),
      oauthStore,
      stateStore,
    }).check();

    expect(result.ready).toBe(true);
    expect(JSON.stringify(result)).not.toContain("oauth-secret");
    expect(JSON.stringify(result)).not.toContain("sk-orbio-synthetic");
  });

  it("blocks missing credit and unsafe permissions", async () => {
    const stateDirectory = await mkdtemp(join(tmpdir(), "orbio-readiness-"));
    const config = createConfig(stateDirectory);
    const oauthStore = new OAuthStateStore(stateDirectory);
    const keyStore = new UpstreamKeyStore(stateDirectory);
    const stateStore = new GuardStateStore(stateDirectory);
    await oauthStore.update({
      tokens: { access_token: "oauth-secret", token_type: "Bearer" },
    });
    await keyStore.save(
      "sk-orbio-synthetic-readiness-key",
      new URL("https://www.orbio.so/api/v1"),
    );
    await stateStore.update(() => undefined);
    await chmod(join(stateDirectory, "guard.json"), 0o644);

    const result = await new SubmissionReadinessService(config, {
      keyStore,
      loadRemote: async () => ({ hasKey: true, spendableCredit: false }),
      oauthStore,
      stateStore,
    }).check();

    expect(result.ready).toBe(false);
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "credit", status: "block" }),
        expect.objectContaining({ id: "permissions_guard.json", status: "block" }),
      ]),
    );
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
    staleReservationPolicy: "confirm",
    stateDirectory,
    upstreamBaseUrl: new URL("https://www.orbio.so/api/v1"),
  };
}
