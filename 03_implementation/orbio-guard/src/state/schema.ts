import { z } from "zod";

const microUsdSchema = z.string().regex(/^\d+$/);

export const guardAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  project: z.string().nullable(),
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["active", "paused", "disabled"]),
  dailyBudgetMicroUsd: microUsdSchema,
  maxRequestMicroUsd: microUsdSchema.nullable(),
  allowedModels: z.array(z.string().min(1)).min(1),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const budgetReservationSchema = z.object({
  id: z.string().min(1),
  amountMicroUsd: microUsdSchema,
  createdAt: z.iso.datetime(),
});

export const dailyBudgetStateSchema = z.object({
  agentId: z.string().min(1),
  date: z.iso.date(),
  confirmedMicroUsd: microUsdSchema,
  reservations: z.array(budgetReservationSchema),
});

export const ledgerEventSchema = z.object({
  id: z.string().min(1),
  timestamp: z.iso.datetime(),
  type: z.enum([
    "AGENT_CREATED",
    "AGENT_STATUS_CHANGED",
    "AGENT_TOKEN_ROTATED",
    "POLICY_UPDATED",
    "BUDGET_RESERVED",
    "SPEND_CONFIRMED",
    "RESERVATION_RELEASED",
    "RESERVATION_RECOVERED",
    "REQUEST_ALLOWED",
    "REQUEST_BLOCKED",
    "UPSTREAM_ERROR",
    "KEY_IMPORTED",
    "KEY_CREATED",
    "KEY_ROTATED",
    "KEY_REVOKED",
  ]),
  agentId: z.string().nullable().optional(),
  requestId: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  reasonCode: z.string().nullable().optional(),
  amountMicroUsd: microUsdSchema.nullable().optional(),
  httpStatus: z.number().int().nullable().optional(),
  keyFingerprint: z.string().nullable().optional(),
});

export const guardStateSchema = z.object({
  version: z.literal(1),
  agents: z.array(guardAgentSchema),
  budgets: z.array(dailyBudgetStateSchema),
  ledger: z.array(ledgerEventSchema).default([]),
});

export type GuardState = z.infer<typeof guardStateSchema>;

export function emptyGuardState(): GuardState {
  return { version: 1, agents: [], budgets: [], ledger: [] };
}
