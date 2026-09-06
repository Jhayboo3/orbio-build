import { z } from "zod";

const usageResponseSchema = z.object({
  usage: z
    .object({
      cost: z.number().nonnegative().optional(),
    })
    .optional(),
});

export function extractCostMicroUsd(responseBody: string): string | undefined {
  try {
    const response = usageResponseSchema.parse(JSON.parse(responseBody));
    if (response.usage?.cost === undefined) {
      return undefined;
    }

    return Math.round(response.usage.cost * 1_000_000).toString();
  } catch {
    return undefined;
  }
}
