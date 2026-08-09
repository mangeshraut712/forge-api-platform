import { describe, expect, it } from "vitest";
import {
  quotaWindowId,
  quotaWindowResetUnix,
  resolvePlanQuota,
} from "./plans.js";

describe("resolvePlanQuota", () => {
  it("returns free daily limit", () => {
    expect(resolvePlanQuota({ plan: "FREE" })).toEqual({
      limit: 100,
      window: "day",
    });
  });

  it("returns developer monthly limit", () => {
    expect(resolvePlanQuota({ plan: "DEVELOPER" })).toEqual({
      limit: 10_000,
      window: "month",
    });
  });

  it("prefers custom daily over monthly", () => {
    expect(
      resolvePlanQuota({
        plan: "CUSTOM",
        customDailyLimit: 50,
        customMonthlyLimit: 9999,
      }),
    ).toEqual({ limit: 50, window: "day" });
  });
});

describe("quota windows", () => {
  it("builds day and month window ids in UTC", () => {
    const now = new Date("2026-03-24T15:30:00.000Z");
    expect(quotaWindowId("day", now)).toBe("2026-03-24");
    expect(quotaWindowId("month", now)).toBe("2026-03");
  });

  it("resets day window at next UTC midnight", () => {
    const now = new Date("2026-03-24T15:30:00.000Z");
    expect(quotaWindowResetUnix("day", now)).toBe(
      Math.floor(Date.UTC(2026, 2, 25) / 1000),
    );
  });
});
