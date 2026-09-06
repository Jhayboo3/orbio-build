import { randomUUID } from "node:crypto";
import type { GuardState, ledgerEventSchema } from "../state/schema.js";
import type { GuardStateStore } from "../state/store.js";
import type { z } from "zod";

export type LedgerEvent = z.infer<typeof ledgerEventSchema>;
export type LedgerEventType = LedgerEvent["type"];

export interface LedgerEventInput {
  agentId?: string | null;
  amountMicroUsd?: string | null;
  httpStatus?: number | null;
  keyFingerprint?: string | null;
  model?: string | null;
  reasonCode?: string | null;
  requestId?: string | null;
  type: LedgerEventType;
}

export class LedgerService {
  constructor(
    private readonly store: GuardStateStore,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async record(input: LedgerEventInput): Promise<LedgerEvent> {
    return this.store.update((state) => appendLedgerEvent(state, input, this.now()));
  }

  async list(limit = 100): Promise<LedgerEvent[]> {
    const state = await this.store.read();
    return state.ledger.slice(-Math.max(0, limit)).reverse();
  }
}

export function appendLedgerEvent(
  state: GuardState,
  input: LedgerEventInput,
  now = new Date(),
): LedgerEvent {
  const event: LedgerEvent = {
    id: randomUUID(),
    timestamp: now.toISOString(),
    type: input.type,
    ...(input.agentId !== undefined ? { agentId: input.agentId } : {}),
    ...(input.amountMicroUsd !== undefined
      ? { amountMicroUsd: input.amountMicroUsd }
      : {}),
    ...(input.httpStatus !== undefined ? { httpStatus: input.httpStatus } : {}),
    ...(input.keyFingerprint !== undefined
      ? { keyFingerprint: input.keyFingerprint }
      : {}),
    ...(input.model !== undefined ? { model: input.model } : {}),
    ...(input.reasonCode !== undefined ? { reasonCode: input.reasonCode } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
  };
  state.ledger.push(event);
  return event;
}
