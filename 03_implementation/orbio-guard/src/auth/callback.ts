import { createServer, type Server } from "node:http";

export interface OAuthCallbackOptions {
  host: string;
  path: string;
  port: number;
  timeoutMs: number;
}

export class OAuthCallbackListener {
  private server: Server | undefined;
  private callbackPromise?: Promise<string>;

  constructor(
    private readonly options: OAuthCallbackOptions,
    private readonly expectedState: () => Promise<string | undefined>,
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    this.callbackPromise = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("OAuth authorization timed out."));
        void this.close();
      }, this.options.timeoutMs);

      this.server = createServer(async (request, response) => {
        try {
          const requestUrl = new URL(
            request.url ?? "/",
            `http://${this.options.host}:${this.options.port}`,
          );

          if (requestUrl.pathname !== this.options.path) {
            response.writeHead(404).end("Not found");
            return;
          }

          const oauthError = requestUrl.searchParams.get("error");
          if (oauthError) {
            const description =
              requestUrl.searchParams.get("error_description") ?? oauthError;
            response
              .writeHead(400, { "content-type": "text/plain; charset=utf-8" })
              .end("Orbio Guard authorization failed. Return to the terminal.");
            throw new Error(`OAuth authorization failed: ${description}`);
          }

          const code = requestUrl.searchParams.get("code");
          const returnedState = requestUrl.searchParams.get("state");
          const savedState = await this.expectedState();

          if (!code) {
            response.writeHead(400).end("Missing authorization code");
            throw new Error("OAuth callback did not include an authorization code.");
          }

          if (!savedState || !returnedState || returnedState !== savedState) {
            response.writeHead(400).end("Invalid OAuth state");
            throw new Error("OAuth state validation failed.");
          }

          response
            .writeHead(200, { "content-type": "text/html; charset=utf-8" })
            .end(
              "<!doctype html><title>Orbio Guard authorized</title><h1>Authorization complete</h1><p>You can close this window and return to the terminal.</p>",
            );
          clearTimeout(timeout);
          resolve(code);
          void this.close();
        } catch (error) {
          clearTimeout(timeout);
          reject(error);
          void this.close();
        }
      });

      this.server.once("error", (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.listen(this.options.port, this.options.host, resolve);
      this.server?.once("error", reject);
    });
  }

  async waitForCode(): Promise<string> {
    if (!this.callbackPromise) {
      throw new Error("OAuth callback listener has not started.");
    }

    return this.callbackPromise;
  }

  async close(): Promise<void> {
    const server = this.server;
    this.server = undefined;

    if (!server?.listening) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
