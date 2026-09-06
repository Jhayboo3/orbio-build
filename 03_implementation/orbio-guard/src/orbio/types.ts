export const ORBIO_TOOL_NAMES = [
  "orbio_get_balance",
  "orbio_claim_credits",
  "orbio_create_key",
  "orbio_top_up_key",
  "orbio_rotate_key",
  "orbio_delete_key",
] as const;

export type OrbioToolName = (typeof ORBIO_TOOL_NAMES)[number];

export interface OrbioBalance {
  availableCreditsUsd: number;
  claimedCreditsUsd?: number;
  unclaimedCreditsUsd?: number;
}

export interface OrbioKeyStatus {
  createdAt?: string;
  fingerprint: string;
  remainingCreditsUsd?: number;
  status: "active" | "revoked" | "unknown";
}

export interface OrbioCreatedKey {
  key: string;
  status: OrbioKeyStatus;
}

export interface OrbioClient {
  claimCredits(): Promise<OrbioBalance>;
  createKey(): Promise<OrbioCreatedKey>;
  deleteKey(keyFingerprint: string): Promise<void>;
  getBalance(): Promise<OrbioBalance>;
  rotateKey(keyFingerprint: string): Promise<OrbioCreatedKey>;
  topUpKey(keyFingerprint: string, amountUsd: number): Promise<OrbioKeyStatus>;
}
