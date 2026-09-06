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

export function extractStreamCostMicroUsd(streamBody: string): string | undefined {
  let latestCost: number | undefined;

  for (const line of streamBody.split(/\r?\n/)) {
    if (!line.startsWith("data:")) {
      continue;
    }

    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      const cost = findUsageCost(JSON.parse(data));
      if (cost !== undefined) {
        latestCost = cost;
      }
    } catch {
      continue;
    }
  }

  return latestCost === undefined
    ? undefined
    : Math.round(latestCost * 1_000_000).toString();
}

function findUsageCost(value: unknown): number | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const cost = findUsageCost(item);
      if (cost !== undefined) {
        return cost;
      }
    }
    return undefined;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const object = value as Record<string, unknown>;
  if (object.usage && typeof object.usage === "object") {
    const usageCost = (object.usage as Record<string, unknown>).cost;
    if (typeof usageCost === "number" && usageCost >= 0) {
      return usageCost;
    }
  }

  for (const nested of Object.values(object)) {
    const cost = findUsageCost(nested);
    if (cost !== undefined) {
      return cost;
    }
  }
  return undefined;
}
