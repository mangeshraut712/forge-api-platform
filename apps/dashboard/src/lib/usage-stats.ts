import { Prisma, type PrismaClient } from "@forge/db";

export type UsageSummary = {
  totalRequests: number;
  successCount: number;
  rateLimited: number;
  successRate: string;
  p50: number;
  p95: number;
};

type UsageRow = {
  total: unknown;
  success: unknown;
  rate_limited: unknown;
  p50: unknown;
  p95: unknown;
};

export function toCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }
  if (typeof value === "bigint" && value >= 0n) return Number(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return 0;
}

export function toLatency(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, Math.round(parsed));
  }
  return 0;
}

export function shapeUsageSummary(row: UsageRow | undefined): UsageSummary {
  const totalRequests = toCount(row?.total);
  const successCount = toCount(row?.success);
  const rateLimited = toCount(row?.rate_limited);
  const successRate =
    totalRequests > 0
      ? ((successCount / totalRequests) * 100).toFixed(1)
      : "0.0";
  return {
    totalRequests,
    successCount,
    rateLimited,
    successRate,
    p50: toLatency(row?.p50),
    p95: toLatency(row?.p95),
  };
}

export function activeApiKeyWhere(projectId: string, now: Date) {
  return {
    projectId,
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  };
}

/** One aggregate instead of loading every latency sample into the dashboard. */
export async function loadUsageSummary(
  db: Pick<PrismaClient, "$queryRaw">,
  projectId: string,
): Promise<UsageSummary> {
  const rows = await db.$queryRaw<UsageRow[]>(Prisma.sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE "statusCode" < 400)::int AS success,
      COUNT(*) FILTER (WHERE "statusCode" = 429)::int AS rate_limited,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY "latencyMs") AS p50,
      percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs") AS p95
    FROM "RequestLog"
    WHERE "projectId" = ${projectId}
  `);
  return shapeUsageSummary(rows[0]);
}
