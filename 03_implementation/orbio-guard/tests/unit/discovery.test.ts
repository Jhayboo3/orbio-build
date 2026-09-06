import { describe, expect, it, vi } from "vitest";
import {
  discoverOrbioOAuth,
  probeOrbioMcpAuthentication,
} from "../../src/orbio/discovery.js";

describe("Orbio discovery", () => {
  it("resolves protected-resource and authorization metadata", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          resource: "https://www.orbio.so/api/mcp",
          authorization_servers: ["https://www.orbio.so"],
          scopes_supported: ["orbio:credits"],
          bearer_methods_supported: ["header"],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          issuer: "https://www.orbio.so",
          authorization_endpoint: "https://www.orbio.so/mcp/authorize",
          token_endpoint: "https://www.orbio.so/api/mcp/oauth/token",
          registration_endpoint: "https://www.orbio.so/api/mcp/oauth/register",
          revocation_endpoint: "https://www.orbio.so/api/mcp/oauth/revoke",
          scopes_supported: ["orbio:credits"],
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        }),
      );

    const result = await discoverOrbioOAuth(
      new URL("https://www.orbio.so/api/mcp"),
      fetchMock,
    );

    expect(result.protectedResource.scopes_supported).toEqual(["orbio:credits"]);
    expect(result.authorizationServer.code_challenge_methods_supported).toEqual([
      "S256",
    ]);
  });

  it("reports the required scope from a 401 response", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 401,
        headers: {
          "www-authenticate": 'Bearer realm="orbio", scope="orbio:credits"',
        },
      }),
    );

    await expect(
      probeOrbioMcpAuthentication(
        new URL("https://www.orbio.so/api/mcp"),
        fetchMock,
      ),
    ).resolves.toEqual({
      authenticated: false,
      requiredScope: "orbio:credits",
      status: 401,
    });
  });
});
