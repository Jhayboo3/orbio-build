import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OAuthStateStore } from "../../src/auth/oauth-store.js";
import { FileOAuthClientProvider } from "../../src/auth/provider.js";

describe("FileOAuthClientProvider", () => {
  it("uses a public PKCE client and persists OAuth state", async () => {
    const directory = await mkdtemp(join(tmpdir(), "orbio-provider-"));
    const store = new OAuthStateStore(directory);
    const redirect = vi.fn(async () => undefined);
    const provider = new FileOAuthClientProvider(
      store,
      new URL("http://127.0.0.1:4319/oauth/callback"),
      redirect,
    );

    expect(provider.clientMetadata.token_endpoint_auth_method).toBe("none");
    expect(provider.clientMetadata.grant_types).toContain("refresh_token");

    const state = await provider.state();
    expect(state).toHaveLength(43);
    await expect(provider.expectedState()).resolves.toBe(state);

    const authorizationUrl = new URL("https://www.orbio.so/mcp/authorize");
    await provider.redirectToAuthorization(authorizationUrl);
    expect(redirect).toHaveBeenCalledWith(authorizationUrl);
  });
});
