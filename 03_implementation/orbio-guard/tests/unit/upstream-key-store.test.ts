import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { UpstreamKeyStore } from "../../src/upstream/key-store.js";

describe("UpstreamKeyStore", () => {
  it("stores the key with owner-only permissions and returns only a fingerprint", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-key-"));
    const store = new UpstreamKeyStore(directory);
    await store.save("or-test-upstream-secret", new URL("https://api.orbio.so/v1"));

    expect((await stat(store.filePath)).mode & 0o777).toBe(0o600);
    await expect(store.status()).resolves.toMatchObject({
      configured: true,
      fingerprint: expect.stringMatching(/^[a-f0-9]{12}$/),
    });
    expect(await readFile(store.filePath, "utf8")).toContain(
      "or-test-upstream-secret",
    );

    await store.clear();
    await expect(store.status()).resolves.toEqual({ configured: false });
  });
});
