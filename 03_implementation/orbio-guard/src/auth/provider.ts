import { randomBytes } from "node:crypto";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { OAuthStateStore } from "./oauth-store.js";

type AuthorizationRedirectHandler = (url: URL) => Promise<void>;

export class FileOAuthClientProvider implements OAuthClientProvider {
  readonly clientMetadata: OAuthClientMetadata;
  readonly redirectUrl: URL;

  constructor(
    private readonly store: OAuthStateStore,
    redirectUrl: URL,
    private readonly onAuthorizationRedirect: AuthorizationRedirectHandler,
  ) {
    this.redirectUrl = redirectUrl;
    this.clientMetadata = {
      client_name: "Orbio Guard",
      redirect_uris: [redirectUrl.toString()],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "orbio:credits",
      software_id: "orbio-guard",
      software_version: "0.1.0",
    };
  }

  async clientInformation(): Promise<
    OAuthClientInformationMixed | undefined
  > {
    return (await this.store.read()).clientInformation;
  }

  async saveClientInformation(
    clientInformation: OAuthClientInformationMixed,
  ): Promise<void> {
    await this.store.update({ clientInformation });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    return (await this.store.read()).tokens;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await this.store.update({ tokens });
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    await this.onAuthorizationRedirect(authorizationUrl);
  }

  async saveCodeVerifier(codeVerifier: string): Promise<void> {
    await this.store.update({ codeVerifier });
  }

  async codeVerifier(): Promise<string> {
    const codeVerifier = (await this.store.read()).codeVerifier;
    if (!codeVerifier) {
      throw new Error("OAuth PKCE verifier is missing. Start authentication again.");
    }

    return codeVerifier;
  }

  async state(): Promise<string> {
    const oauthState = randomBytes(32).toString("base64url");
    await this.store.update({ oauthState });
    return oauthState;
  }

  async expectedState(): Promise<string | undefined> {
    return (await this.store.read()).oauthState;
  }

  async invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ): Promise<void> {
    if (scope === "discovery") {
      return;
    }

    await this.store.clear(scope);
  }
}
