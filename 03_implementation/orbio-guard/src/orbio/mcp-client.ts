import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { GuardConfig } from "../config/schema.js";
import { OAuthCallbackListener } from "../auth/callback.js";
import { openAuthorizationUrl } from "../auth/browser.js";
import { OAuthStateStore } from "../auth/oauth-store.js";
import { FileOAuthClientProvider } from "../auth/provider.js";

export interface OrbioToolDescriptor {
  description?: string;
  inputSchema: Record<string, unknown>;
  name: string;
  title?: string;
}

export interface OrbioMcpSession {
  callTool(name: string, argumentsValue?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
  listTools(): Promise<OrbioToolDescriptor[]>;
}

type AuthorizationLauncher = (url: URL) => Promise<void>;

export async function connectOrbioMcp(
  config: GuardConfig,
  launchAuthorization: AuthorizationLauncher = openAuthorizationUrl,
): Promise<OrbioMcpSession> {
  const callbackUrl = new URL(
    `http://127.0.0.1:${config.oauthCallbackPort}/oauth/callback`,
  );
  const store = new OAuthStateStore(config.stateDirectory);
  let callbackListener: OAuthCallbackListener;
  const provider = new FileOAuthClientProvider(
    store,
    callbackUrl,
    async (authorizationUrl) => {
      await callbackListener.start();
      console.log("Opening Orbio authorization in your browser...");
      await launchAuthorization(authorizationUrl);
    },
  );
  callbackListener = new OAuthCallbackListener(
    {
      host: "127.0.0.1",
      path: callbackUrl.pathname,
      port: config.oauthCallbackPort,
      timeoutMs: config.oauthTimeoutMs,
    },
    () => provider.expectedState(),
  );

  let connection = createConnection(config, provider);

  try {
    await connection.client.connect(connection.transport as Transport);
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) {
      await callbackListener.close();
      throw error;
    }

    const authorizationCode = await callbackListener.waitForCode();
    await connection.transport.finishAuth(authorizationCode);
    await connection.transport.close();
    connection = createConnection(config, provider);
    await connection.client.connect(connection.transport as Transport);
  } finally {
    await callbackListener.close();
  }

  return {
    async callTool(name, argumentsValue = {}) {
      return connection.client.callTool({
        name,
        arguments: argumentsValue,
      });
    },
    async close() {
      await connection.transport.close();
    },
    async listTools() {
      const result = await connection.client.listTools();
      return result.tools.map((tool) => ({
        ...(tool.description ? { description: tool.description } : {}),
        inputSchema: tool.inputSchema as Record<string, unknown>,
        name: tool.name,
        ...(tool.title ? { title: tool.title } : {}),
      }));
    },
  };
}

function createConnection(
  config: GuardConfig,
  provider: FileOAuthClientProvider,
): {
  client: Client;
  transport: StreamableHTTPClientTransport;
} {
  return {
    client: new Client(
      { name: "orbio-guard", version: "0.1.0" },
      { capabilities: {} },
    ),
    transport: new StreamableHTTPClientTransport(config.mcpEndpoint, {
      authProvider: provider,
    }),
  };
}
