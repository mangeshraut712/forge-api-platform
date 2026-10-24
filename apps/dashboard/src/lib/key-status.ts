export type KeyStatus = "active" | "grace" | "revoked" | "expired";

export type KeyStatusInput = {
  revokedAt: Date | string | null;
  graceEndsAt?: Date | string | null;
  expiresAt?: Date | string | null;
};

function timestamp(value: Date | string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * A key that has passed expiresAt does not authenticate, even inside a
 * rotation grace window, so expiry wins over grace.
 */
export function keyStatus(key: KeyStatusInput, now = Date.now()): KeyStatus {
  const expiresAt = timestamp(key.expiresAt);
  if (expiresAt !== null && expiresAt <= now) return "expired";

  const revokedAt = timestamp(key.revokedAt);
  if (revokedAt === null) return "active";

  const graceEndsAt = timestamp(key.graceEndsAt);
  if (graceEndsAt !== null && graceEndsAt > now) return "grace";
  return "revoked";
}

export function canRotateKey(status: KeyStatus): boolean {
  return status === "active";
}

export function canRevokeKey(status: KeyStatus): boolean {
  return status === "active" || status === "grace" || status === "expired";
}
