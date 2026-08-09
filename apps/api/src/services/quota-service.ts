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
import { ApiError, quotaExceeded } from "../lib/errors.js";

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
    const count = await redis.incr(key);
    if (count === 1) {
      // First request in window — set expiry
      await redis.expire(key, ttl);
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
    throw quotaExceeded("Quota service unavailable");
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
    const count = parseInt((await redis.get(key)) ?? "0", 10);
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
