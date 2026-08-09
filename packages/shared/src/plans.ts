export const PLANS = {
  FREE: "FREE",
  DEVELOPER: "DEVELOPER",
  CUSTOM: "CUSTOM",
} as const;

export type Plan = (typeof PLANS)[keyof typeof PLANS];

export type QuotaWindow = "day" | "month";

export type PlanQuota = {
  limit: number;
  window: QuotaWindow;
};

/** Default plan limits — Free is daily, Developer is monthly. */
export const PLAN_QUOTAS: Record<Exclude<Plan, "CUSTOM">, PlanQuota> = {
  FREE: { limit: 100, window: "day" },
  DEVELOPER: { limit: 10_000, window: "month" },
};

export type ProjectQuotaInput = {
  plan: Plan;
  customDailyLimit?: number | null;
  customMonthlyLimit?: number | null;
};

/**
 * Resolve effective quota for a project.
 * Custom plans prefer daily limit when set; otherwise monthly.
 */
export function resolvePlanQuota(project: ProjectQuotaInput): PlanQuota {
  if (project.plan === "CUSTOM") {
    if (project.customDailyLimit != null && project.customDailyLimit > 0) {
      return { limit: project.customDailyLimit, window: "day" };
    }
    if (project.customMonthlyLimit != null && project.customMonthlyLimit > 0) {
      return { limit: project.customMonthlyLimit, window: "month" };
    }
    // Safe fallback if misconfigured
    return PLAN_QUOTAS.FREE;
  }
  return PLAN_QUOTAS[project.plan];
}

/** UTC window id used in Redis keys, e.g. 2026-03-24 or 2026-03 */
export function quotaWindowId(window: QuotaWindow, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return window === "day" ? `${y}-${m}-${d}` : `${y}-${m}`;
}

/** Unix seconds when the current window resets (UTC). */
export function quotaWindowResetUnix(
  window: QuotaWindow,
  now = new Date(),
): number {
  if (window === "day") {
    const next = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0,
      0,
      0,
      0,
    );
    return Math.floor(next / 1000);
  }
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1,
    0,
    0,
    0,
    0,
  );
  return Math.floor(next / 1000);
}

/** Seconds until window end — used as Redis key TTL. */
export function quotaWindowTtlSeconds(
  window: QuotaWindow,
  now = new Date(),
): number {
  const reset = quotaWindowResetUnix(window, now);
  const nowSec = Math.floor(now.getTime() / 1000);
  return Math.max(1, reset - nowSec + 60); // +60s buffer
}
