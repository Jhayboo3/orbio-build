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

export const guardStateSchema = z.object({
  version: z.literal(1),
  agents: z.array(guardAgentSchema),
  budgets: z.array(dailyBudgetStateSchema),
});

export type GuardState = z.infer<typeof guardStateSchema>;

export function emptyGuardState(): GuardState {
  return { version: 1, agents: [], budgets: [] };
}
