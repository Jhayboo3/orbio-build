import { mkdir, readFile, rename, chmod, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";

export interface StoredOAuthState {
  clientInformation?: OAuthClientInformationMixed;
  codeVerifier?: string;
  oauthState?: string;
  tokens?: OAuthTokens;
}

export class OAuthStateStore {
  readonly filePath: string;

  constructor(stateDirectory: string) {
    this.filePath = join(stateDirectory, "oauth.json");
  }

  async read(): Promise<StoredOAuthState> {
    try {
      const contents = await readFile(this.filePath, "utf8");
      return JSON.parse(contents) as StoredOAuthState;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }

  async update(update: Partial<StoredOAuthState>): Promise<void> {
    const current = await this.read();
    await this.write({ ...current, ...update });
  }

  async clear(scope: "all" | "client" | "tokens" | "verifier"): Promise<void> {
    const current = await this.read();

    if (scope === "all") {
      await this.write({});
      return;
    }

    if (scope === "client") {
      delete current.clientInformation;
    } else if (scope === "tokens") {
      delete current.tokens;
    } else {
      delete current.codeVerifier;
      delete current.oauthState;
    }

    await this.write(current);
  }

  private async write(state: StoredOAuthState): Promise<void> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { mode: 0o700, recursive: true });
    await chmod(directory, 0o700);

    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
    await chmod(this.filePath, 0o600);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
