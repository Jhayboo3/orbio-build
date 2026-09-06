import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OAuthStateStore } from "../../src/auth/oauth-store.js";

describe("OAuthStateStore", () => {
  it("persists credentials atomically with owner-only permissions", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-oauth-"));
    const store = new OAuthStateStore(directory);

    await store.update({
      codeVerifier: "verifier",
      tokens: { access_token: "access", token_type: "Bearer" },
    });

    await expect(store.read()).resolves.toMatchObject({
      codeVerifier: "verifier",
      tokens: { access_token: "access" },
    });
    expect((await stat(store.filePath)).mode & 0o777).toBe(0o600);
    expect(await readFile(store.filePath, "utf8")).not.toContain(".tmp");
  });

  it("can clear tokens without deleting registered client information", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-oauth-"));
    const store = new OAuthStateStore(directory);
    await store.update({
      clientInformation: { client_id: "client-id" },
      tokens: { access_token: "access", token_type: "Bearer" },
    });

    await store.clear("tokens");

    await expect(store.read()).resolves.toEqual({
      clientInformation: { client_id: "client-id" },
    });
  });
});
