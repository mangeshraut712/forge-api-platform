export const KEY_ENVS = {
  TEST: "TEST",
  LIVE: "LIVE",
} as const;

export type KeyEnv = (typeof KEY_ENVS)[keyof typeof KEY_ENVS];

export const KEY_PREFIX_BY_ENV: Record<KeyEnv, string> = {
  TEST: "forge_test_",
  LIVE: "forge_live_",
};

/** Visible prefix length stored for lookup/display (includes env prefix). */
export const KEY_VISIBLE_PREFIX_LENGTH = 16;

/** Secret random portion length (hex chars). */
export const KEY_SECRET_BYTES = 24;

export const API_KEY_REGEX = /^forge_(test|live)_[a-f0-9]{48}$/;

export function isValidApiKeyFormat(key: string): boolean {
  return API_KEY_REGEX.test(key);
}

export function envFromApiKey(key: string): KeyEnv | null {
  if (key.startsWith("forge_test_")) return "TEST";
  if (key.startsWith("forge_live_")) return "LIVE";
  return null;
}

export function visibleKeyPrefix(fullKey: string): string {
  return fullKey.slice(0, KEY_VISIBLE_PREFIX_LENGTH);
}
