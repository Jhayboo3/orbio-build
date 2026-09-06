import { z } from "zod";

const moneyAmountSchema = z.object({
  microUsd: z.string().regex(/^\d+$/),
  usd: z.number().nonnegative(),
});

export const orbioBalanceSchema = z.object({
  wallets: z.array(z.string().min(1)),
  accrued: moneyAmountSchema,
  purchased: moneyAmountSchema,
  spent: moneyAmountSchema,
  claimed: moneyAmountSchema,
  balance: moneyAmountSchema,
});

const legacyKeyStatusSchema = z.object({
  label: z.string(),
  limitUsd: z.number().nonnegative(),
  usageUsd: z.number().nonnegative(),
  remainingUsd: z.number().nonnegative(),
  disabled: z.boolean(),
  readable: z.boolean(),
});

export const orbioKeyStatusSchema = z.object({
  hasKey: z.boolean(),
  prefix: z.string().nullable(),
  createdAt: z.string().nullable(),
  lastUsedAt: z.string().nullable(),
  baseUrl: z.url(),
  legacy: legacyKeyStatusSchema.nullable(),
});

export function parseStructuredToolResult<T>(
  result: unknown,
  schema: z.ZodType<T>,
): T {
  if (!result || typeof result !== "object" || !("structuredContent" in result)) {
    throw new Error("Orbio tool response did not include structured content.");
  }

  return schema.parse(
    (result as { structuredContent?: unknown }).structuredContent,
  );
}
