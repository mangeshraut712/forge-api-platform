import { describe, expect, it, vi } from "vitest";
import {
  activeApiKeyWhere,
  loadUsageSummary,
  shapeUsageSummary,
  toCount,
  toLatency,
} from "./usage-stats";

describe("usage stats", () => {
  it("normalizes database numbers", () => {
    expect(toCount("12")).toBe(12);
    expect(toCount(3.9)).toBe(3);
    expect(toCount(-1)).toBe(0);
    expect(toCount("nope")).toBe(0);
    expect(toLatency("12.4")).toBe(12);
    expect(toLatency(null)).toBe(0);
  });

  it("shapes an aggregate row without loading every latency", () => {
    expect(
      shapeUsageSummary({
        total: 4,
        success: 3,
        rate_limited: 1,
        p50: 10.2,
        p95: "40.6",
      }),
    ).toEqual({
      totalRequests: 4,
      successCount: 3,
      rateLimited: 1,
      successRate: "75.0",
      p50: 10,
      p95: 41,
    });
    expect(shapeUsageSummary(undefined).successRate).toBe("0.0");
  });

  it("excludes revoked and expired keys from the active count", () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    expect(activeApiKeyWhere("proj_1", now)).toEqual({
      projectId: "proj_1",
      revokedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    });
  });

  it("parameterizes the project id in the aggregate query", async () => {
    const queryRaw = vi
      .fn()
      .mockResolvedValue([
        { total: 2, success: 2, rate_limited: 0, p50: 5, p95: 9 },
      ]);

    await expect(
      loadUsageSummary({ $queryRaw: queryRaw }, "proj_1"),
    ).resolves.toMatchObject({ totalRequests: 2, successRate: "100.0" });

    const sql = queryRaw.mock.calls[0]?.[0] as {
      strings: string[];
      values: unknown[];
    };
    expect(sql.values).toEqual(["proj_1"]);
    expect(sql.strings.join(" ")).toContain('WHERE "projectId" =');
    expect(sql.strings.join(" ")).toContain("percentile_cont(0.5)");
    expect(sql.strings.join(" ")).not.toContain("proj_1");
  });
});
