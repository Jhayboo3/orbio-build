import { z } from "zod";

const protectedResourceSchema = z.object({
  resource: z.url(),
  authorization_servers: z.array(z.url()).min(1),
  scopes_supported: z.array(z.string()).default([]),
  bearer_methods_supported: z.array(z.string()).default([]),
  resource_name: z.string().optional(),
  resource_documentation: z.url().optional(),
});

const authorizationServerSchema = z.object({
  issuer: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  registration_endpoint: z.url().optional(),
  revocation_endpoint: z.url().optional(),
  scopes_supported: z.array(z.string()).default([]),
  response_types_supported: z.array(z.string()).default([]),
  grant_types_supported: z.array(z.string()).default([]),
  code_challenge_methods_supported: z.array(z.string()).default([]),
  token_endpoint_auth_methods_supported: z.array(z.string()).default([]),
});

export type ProtectedResourceMetadata = z.infer<
  typeof protectedResourceSchema
>;
export type AuthorizationServerMetadata = z.infer<
  typeof authorizationServerSchema
>;

export interface OrbioDiscoveryResult {
  authorizationServer: AuthorizationServerMetadata;
  protectedResource: ProtectedResourceMetadata;
}

export async function discoverOrbioOAuth(
  mcpEndpoint: URL,
  fetchImplementation: typeof fetch = fetch,
): Promise<OrbioDiscoveryResult> {
  const protectedResourceUrl = new URL(
    `/.well-known/oauth-protected-resource${mcpEndpoint.pathname}`,
    mcpEndpoint.origin,
  );

  const resourceResponse = await fetchImplementation(protectedResourceUrl);
  if (!resourceResponse.ok) {
    throw new Error(
      `Orbio protected-resource discovery failed with HTTP ${resourceResponse.status}.`,
    );
  }

  const protectedResource = protectedResourceSchema.parse(
    await resourceResponse.json(),
  );
  const authorizationServerUrl = new URL(
    "/.well-known/oauth-authorization-server",
    protectedResource.authorization_servers[0],
  );
  const authorizationResponse = await fetchImplementation(authorizationServerUrl);

  if (!authorizationResponse.ok) {
    throw new Error(
      `Orbio authorization-server discovery failed with HTTP ${authorizationResponse.status}.`,
    );
  }

  return {
    authorizationServer: authorizationServerSchema.parse(
      await authorizationResponse.json(),
    ),
    protectedResource,
  };
}

export async function probeOrbioMcpAuthentication(
  mcpEndpoint: URL,
  fetchImplementation: typeof fetch = fetch,
): Promise<{ authenticated: boolean; requiredScope?: string; status: number }> {
  const response = await fetchImplementation(mcpEndpoint, {
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "orbio-guard", version: "0.1.0" },
      },
    }),
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      "mcp-protocol-version": "2025-06-18",
    },
    method: "POST",
  });

  const authenticateHeader = response.headers.get("www-authenticate") ?? "";
  const scopeMatch = authenticateHeader.match(/scope="([^"]+)"/);

  return {
    authenticated: response.status !== 401,
    ...(scopeMatch?.[1] ? { requiredScope: scopeMatch[1] } : {}),
    status: response.status,
  };
}
