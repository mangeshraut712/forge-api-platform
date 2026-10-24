/**
 * Redis-backed quota counter using INCR + EXPIRE.
 * Returns remaining count and reset time. Fails open or closed based on env.
 */
import { getRedis } from "../lib/redis.js";
import { env } from "../lib/env.js";
import {
  quotaWindowId,
  quotaWindowResetUnix,
  quotaWindowTtlSeconds,
  resolvePlanQuota,
  type PlanQuota,
} from "@forge/shared";
import { ApiError } from "../lib/errors.js";

const QUOTA_INCREMENT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
`;

export type QuotaCheckResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  window: PlanQuota["window"];
  resetUnix: number;
};

function quotaKey(
  projectId: string,
  window: PlanQuota["window"],
  windowId: string,
): string {
  return `quota:${projectId}:${window}:${windowId}`;
}

/**
 * Increment the counter for the current window and check against the limit.
 * On Redis failure, respects QUOTA_FAIL_MODE (open = allow, closed = deny).
 */
export async function checkQuota(
  projectId: string,
  project: {
    plan: "FREE" | "DEVELOPER" | "CUSTOM";
    customDailyLimit?: number | null;
    customMonthlyLimit?: number | null;
  },
): Promise<QuotaCheckResult> {
  const quota = resolvePlanQuota(project);
  const windowId = quotaWindowId(quota.window);
  const resetUnix = quotaWindowResetUnix(quota.window);
  const ttl = quotaWindowTtlSeconds(quota.window);
  const key = quotaKey(projectId, quota.window, windowId);

  try {
    const redis = getRedis();
    const incremented = await redis.eval(
      QUOTA_INCREMENT_SCRIPT,
      1,
      key,
      String(ttl),
    );
    const count = Number(incremented);
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error("invalid quota counter");
    }
    const remaining = Math.max(0, quota.limit - count);
    const allowed = count <= quota.limit;
    return {
      allowed,
      remaining,
      limit: quota.limit,
      window: quota.window,
      resetUnix,
    };
  } catch (err) {
    console.error("[quota] redis error, failing", env.quotaFailMode, err);
    if (env.quotaFailMode === "open") {
      return {
        allowed: true,
        remaining: quota.limit,
        limit: quota.limit,
        window: quota.window,
        resetUnix,
      };
    }
    throw new ApiError(503, "quota_unavailable", "Quota service unavailable");
  }
}

/** Get current quota usage without incrementing. */
export async function getQuotaUsage(
  projectId: string,
  project: {
    plan: "FREE" | "DEVELOPER" | "CUSTOM";
    customDailyLimit?: number | null;
    customMonthlyLimit?: number | null;
  },
): Promise<QuotaCheckResult> {
  const quota = resolvePlanQuota(project);
  const windowId = quotaWindowId(quota.window);
  const resetUnix = quotaWindowResetUnix(quota.window);
  const key = quotaKey(projectId, quota.window, windowId);

  try {
    const redis = getRedis();
    const raw = await redis.get(key);
    const count = raw == null ? 0 : Number(raw);
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error("invalid quota counter");
    }
    const remaining = Math.max(0, quota.limit - count);
    return {
      allowed: remaining > 0,
      remaining,
      limit: quota.limit,
      window: quota.window,
      resetUnix,
    };
  } catch {
    if (env.quotaFailMode === "open") {
      return {
        allowed: true,
        remaining: quota.limit,
        limit: quota.limit,
        window: quota.window,
        resetUnix,
      };
    }
    throw new ApiError(503, "quota_unavailable", "Quota service unavailable");
  }
}
