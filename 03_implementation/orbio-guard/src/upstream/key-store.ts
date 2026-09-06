import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";

const credentialsSchema = z.object({
  baseUrl: z.url(),
  key: z.string().min(12),
  updatedAt: z.iso.datetime(),
});

export interface UpstreamCredentials {
  baseUrl: URL;
  key: string;
  updatedAt: string;
}

export class UpstreamKeyStore {
  readonly filePath: string;

  constructor(stateDirectory: string) {
    this.filePath = join(stateDirectory, "upstream.json");
  }

  async save(key: string, baseUrl: URL): Promise<void> {
    const normalizedKey = key.trim();
    const normalizedBaseUrl = canonicalizeOrbioBaseUrl(baseUrl);
    const state = credentialsSchema.parse({
      baseUrl: normalizedBaseUrl.toString(),
      key: normalizedKey,
      updatedAt: new Date().toISOString(),
    });
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

  async load(): Promise<UpstreamCredentials> {
    try {
      const state = credentialsSchema.parse(
        JSON.parse(await readFile(this.filePath, "utf8")),
      );
      return {
        baseUrl: canonicalizeOrbioBaseUrl(new URL(state.baseUrl)),
        key: state.key,
        updatedAt: state.updatedAt,
      };
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        throw new Error(
          "No upstream Orbio key is configured. Run `orbio-guard key import` first.",
        );
      }
      throw error;
    }
  }

  async status(): Promise<
    | { configured: false }
    | { configured: true; fingerprint: string; updatedAt: string }
  > {
    try {
      const credentials = await this.load();
      return {
        configured: true,
        fingerprint: fingerprint(credentials.key),
        updatedAt: credentials.updatedAt,
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("No upstream Orbio key")) {
        return { configured: false };
      }
      throw error;
    }
  }

  async clear(): Promise<void> {
    await rm(this.filePath, { force: true });
  }
}

export function canonicalizeOrbioBaseUrl(baseUrl: URL): URL {
  const canonical = new URL(baseUrl);
  if (canonical.hostname === "orbio.so") {
    canonical.hostname = "www.orbio.so";
  }
  return canonical;
}

function fingerprint(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 12);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
