import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  emptyGuardState,
  guardStateSchema,
  type GuardState,
} from "./schema.js";

export class GuardStateStore {
  readonly filePath: string;
  private queue: Promise<void> = Promise.resolve();

  constructor(stateDirectory: string) {
    this.filePath = join(stateDirectory, "guard.json");
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
    let resolveResult: (value: T | PromiseLike<T>) => void;
    let rejectResult: (reason?: unknown) => void;
    const result = new Promise<T>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });

    this.queue = this.queue.then(async () => {
      try {
        const state = await this.read();
        const value = await mutator(state);
        await this.write(guardStateSchema.parse(state));
        resolveResult(value);
      } catch (error) {
        rejectResult(error);
      }
    });

    return result;
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
