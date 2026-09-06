const MICRO_USD_PER_USD = 1_000_000n;

export function parseUsdToMicroUsd(value: string): string {
  const normalized = value.trim();
  const match = normalized.match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match?.[1]) {
    throw new Error("USD amount must be a non-negative number with up to 6 decimals.");
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0"));
  return (whole * MICRO_USD_PER_USD + fraction).toString();
}

export function formatMicroUsd(value: string): string {
  const amount = parseMicroUsd(value);
  const whole = amount / MICRO_USD_PER_USD;
  const fraction = (amount % MICRO_USD_PER_USD)
    .toString()
    .padStart(6, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function parseMicroUsd(value: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error("Micro-USD value must be a non-negative integer string.");
  }

  return BigInt(value);
}
