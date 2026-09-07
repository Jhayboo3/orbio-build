import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { GuardConfig } from "../config/schema.js";
import type { LedgerService } from "../domain/ledger.js";
import type { UpstreamKeyStore } from "../upstream/key-store.js";
import { connectOrbioMcp, type OrbioMcpSession } from "./mcp-client.js";
import { extractCreatedOrbioKey } from "./key-result.js";
import {
  orbioBalanceSchema,
  orbioKeyStatusSchema,
  parseStructuredToolResult,
} from "./results.js";

type ConnectOrbio = () => Promise<OrbioMcpSession>;

export class OrbioKeyLifecycleService {
  private readonly recoveryPath: string;

  constructor(
    private readonly config: GuardConfig,
    private readonly keyStore: UpstreamKeyStore,
    private readonly ledger: LedgerService,
    private readonly connect: ConnectOrbio = () => connectOrbioMcp(config),
  ) {
    this.recoveryPath = join(config.stateDirectory, "key-create-recovery.json");
  }

  async createOrRotate(input: {
    allowRotation: boolean;
    label?: string;
  }): Promise<{ fingerprint: string; rotated: boolean }> {
    const session = await this.connect();

    try {
      const currentStatus = parseStructuredToolResult(
        await session.callTool("orbio_get_key_status"),
        orbioKeyStatusSchema,
      );
      if (currentStatus.hasKey && !input.allowRotation) {
        throw new Error(
          "An Orbio key already exists. Re-run with --rotate to replace it.",
        );
      }

      const result = await session.callTool("orbio_create_key", {
        ...(input.label ? { label: input.label } : {}),
      });
      await this.writeRecovery(result);

      try {
        const extracted = extractCreatedOrbioKey(result);
        await this.keyStore.save(
          extracted.key,
          extracted.baseUrl ?? new URL(currentStatus.baseUrl),
        );
        const status = await this.keyStore.status();
        if (!status.configured) {
          throw new Error("The created Orbio key could not be persisted.");
        }
        await this.ledger.record({
          keyFingerprint: status.fingerprint,
          type: currentStatus.hasKey ? "KEY_ROTATED" : "KEY_CREATED",
        });
        await rm(this.recoveryPath, { force: true });
        return {
          fingerprint: status.fingerprint,
          rotated: currentStatus.hasKey,
        };
      } catch (error) {
        throw new Error(
          `Orbio returned a key, but Guard could not finish storing it. Recovery data remains at ${this.recoveryPath}. ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    } finally {
      await session.close();
    }
  }

  async revoke(): Promise<void> {
    const session = await this.connect();
    try {
      await session.callTool("orbio_revoke_key");
      await this.keyStore.clear();
      await this.ledger.record({ type: "KEY_REVOKED" });
    } finally {
      await session.close();
    }
  }

  async migrateLegacyKey(): Promise<{
    migratedUsd: number;
    spendableBalanceUsd: number;
  }> {
    const session = await this.connect();
    try {
      const currentStatus = parseStructuredToolResult(
        await session.callTool("orbio_get_key_status"),
        orbioKeyStatusSchema,
      );
      if (!currentStatus.legacy || currentStatus.legacy.disabled) {
        throw new Error("No active legacy OpenRouter key is available to migrate.");
      }

      const migratedUsd = currentStatus.legacy.remainingUsd;
      const previousBalance = parseStructuredToolResult(
        await session.callTool("orbio_get_balance"),
        orbioBalanceSchema,
      );
      await session.callTool("orbio_delete_key");
      const updatedStatus = parseStructuredToolResult(
        await session.callTool("orbio_get_key_status"),
        orbioKeyStatusSchema,
      );
      if (updatedStatus.legacy && !updatedStatus.legacy.disabled) {
        throw new Error("Orbio did not report the legacy key as disabled after migration.");
      }

      await this.ledger.record({
        amountMicroUsd: Math.round(migratedUsd * 1_000_000).toString(),
        type: "LEGACY_KEY_DELETED",
      });

      const balance = parseStructuredToolResult(
        await session.callTool("orbio_get_balance"),
        orbioBalanceSchema,
      );
      const expectedBalanceMicroUsd =
        BigInt(previousBalance.balance.microUsd) +
        BigInt(Math.round(migratedUsd * 1_000_000));
      if (BigInt(balance.balance.microUsd) < expectedBalanceMicroUsd) {
        throw new Error(
          `Legacy key was disabled, but the spendable balance did not increase by the expected $${migratedUsd.toFixed(6)}. Check Orbio account status before retrying any operation.`,
        );
      }

      return {
        migratedUsd,
        spendableBalanceUsd: balance.balance.usd,
      };
    } finally {
      await session.close();
    }
  }

  private async writeRecovery(result: unknown): Promise<void> {
    await mkdir(this.config.stateDirectory, { mode: 0o700, recursive: true });
    await chmod(this.config.stateDirectory, 0o700);
    const temporaryPath = `${this.recoveryPath}.${randomUUID()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(result, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(temporaryPath, this.recoveryPath);
    await chmod(this.recoveryPath, 0o600);
  }
}
