import { randomUUID } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  emptyGuardState,
  guardStateSchema,
  type GuardState,
} from "./schema.js";

export class GuardStateStore {
  readonly filePath: string;
  readonly lockPath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(stateDirectory: string) {
    this.filePath = join(stateDirectory, "guard.json");
    this.lockPath = join(stateDirectory, "guard.json.lock");
  }

  async read(): Promise<GuardState> {
    try {
      return guardStateSchema.parse(
        JSON.parse(await readFile(this.filePath, "utf8")),
      );
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return emptyGuardState();
      }

      throw error;
    }
  }

  async update<T>(
    mutator: (state: GuardState) => T | Promise<T>,
  ): Promise<T> {
    const operation = this.queue.then(() =>
      this.withFileLock(async () => {
        const state = await this.read();
        const value = await mutator(state);
        await this.write(guardStateSchema.parse(state));
        return value;
      }),
    );
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private async withFileLock<T>(operation: () => Promise<T>): Promise<T> {
    const directory = dirname(this.filePath);
    await mkdir(directory, { mode: 0o700, recursive: true });
    await chmod(directory, 0o700);
    const handle = await this.acquireLock();
    try {
      return await operation();
    } finally {
      await handle.close();
      await rm(this.lockPath, { force: true });
    }
  }

  private async acquireLock() {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const handle = await open(this.lockPath, "wx", 0o600);
        await handle.writeFile(
          `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        );
        return handle;
      } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
          throw error;
        }

        try {
          const lockStats = await stat(this.lockPath);
          if (Date.now() - lockStats.mtimeMs > 30_000) {
            await rm(this.lockPath, { force: true });
            continue;
          }
        } catch (statError) {
          if (!isNodeError(statError) || statError.code !== "ENOENT") {
            throw statError;
          }
        }
        await delay(10);
      }
    }

    throw new Error(`Timed out waiting for Guard state lock at ${this.lockPath}.`);
  }

  private async write(state: GuardState): Promise<void> {
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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
