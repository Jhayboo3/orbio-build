export const ORBIO_TOOL_NAMES = [
  "orbio_get_balance",
  "orbio_get_key_status",
  "orbio_create_key",
  "orbio_revoke_key",
  "orbio_delete_key",
] as const;

export const PUBLIC_DOCUMENTED_ORBIO_TOOL_NAMES = [
  "orbio_get_balance",
  "orbio_claim_credits",
  "orbio_create_key",
  "orbio_top_up_key",
  "orbio_rotate_key",
  "orbio_delete_key",
] as const;

export type OrbioToolName = (typeof ORBIO_TOOL_NAMES)[number];

export interface OrbioMoneyAmount {
  microUsd: string;
  usd: number;
}

export interface OrbioBalance {
  accrued: OrbioMoneyAmount;
  balance: OrbioMoneyAmount;
  claimed: OrbioMoneyAmount;
  purchased: OrbioMoneyAmount;
  spent: OrbioMoneyAmount;
  wallets: string[];
}

export interface OrbioLegacyKeyStatus {
  disabled: boolean;
  label: string;
  limitUsd: number;
  readable: boolean;
  remainingUsd: number;
  usageUsd: number;
}

export interface OrbioKeyStatus {
  baseUrl: string;
  createdAt: string | null;
  hasKey: boolean;
  lastUsedAt: string | null;
  legacy: OrbioLegacyKeyStatus | null;
  prefix: string | null;
}

export interface OrbioCreatedKey {
  key: string;
  status: OrbioKeyStatus;
}

export interface OrbioClient {
  createKey(options?: { label?: string }): Promise<OrbioCreatedKey>;
  deleteLegacyKey(): Promise<void>;
  getBalance(): Promise<OrbioBalance>;
  getKeyStatus(): Promise<OrbioKeyStatus>;
  revokeKey(): Promise<void>;
}

export function compareOrbioToolContract(actualNames: string[]): {
  missing: OrbioToolName[];
  unexpected: string[];
} {
  const actual = new Set(actualNames);
  const expected = new Set<string>(ORBIO_TOOL_NAMES);

  return {
    missing: ORBIO_TOOL_NAMES.filter((name) => !actual.has(name)),
    unexpected: actualNames.filter((name) => !expected.has(name)),
  };
}
