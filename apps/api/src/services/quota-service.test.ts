import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../lib/env.js";
import { ApiError } from "../lib/errors.js";
import { checkQuota, getQuotaUsage } from "./quota-service.js";

const { redis } = vi.hoisted(() => ({
  redis: {
    incr: vi.fn(),
    expire: vi.fn(),
    get: vi.fn(),
  },
}));

vi.mock("../lib/redis.js", () => ({
  getRedis: () => redis,
}));

const originalFailMode = env.quotaFailMode;
const free = {
  plan: "FREE" as const,
  customDailyLimit: null,
  customMonthlyLimit: null,
};

describe("quota service", () => {
  beforeEach(() => {
    redis.incr.mockReset();
    redis.expire.mockReset();
    redis.get.mockReset();
    redis.expire.mockResolvedValue(1);
    env.quotaFailMode = "open";
  });

  afterEach(() => {
    env.quotaFailMode = originalFailMode;
    vi.restoreAllMocks();
  });

  describe("checkQuota", () => {
    it("allows the request that reaches a free-plan limit and expires the first hit", async () => {
      redis.incr.mockResolvedValueOnce(1).mockResolvedValueOnce(100);

      const first = await checkQuota("proj_1", free);
      const second = await checkQuota("proj_1", free);

      expect(first).toMatchObject({
        allowed: true,
        remaining: 99,
        limit: 100,
        window: "day",
      });
      expect(second).toMatchObject({ allowed: true, remaining: 0, limit: 100 });
      expect(redis.incr).toHaveBeenCalledWith(
        expect.stringMatching(/^quota:proj_1:day:\d{4}-\d{2}-\d{2}$/),
      );
      const key = redis.incr.mock.calls[0]?.[0];
      const ttl = redis.expire.mock.calls[0]?.[1];
      expect(redis.expire).toHaveBeenCalledTimes(1);
      expect(redis.expire).toHaveBeenCalledWith(key, ttl);
      expect(ttl).toBeGreaterThan(0);
      expect(first.resetUnix).toBeGreaterThan(Math.floor(Date.now() / 1000));
    });

    it("denies the request after the limit", async () => {
      redis.incr.mockResolvedValue(101);

      await expect(checkQuota("proj_1", free)).resolves.toMatchObject({
        allowed: false,
        remaining: 0,
        limit: 100,
      });
      expect(redis.expire).not.toHaveBeenCalled();
    });

    it("uses the developer monthly window", async () => {
      redis.incr.mockResolvedValue(2);

      await expect(
        checkQuota("proj_1", {
          plan: "DEVELOPER",
          customDailyLimit: null,
          customMonthlyLimit: null,
        }),
      ).resolves.toMatchObject({
        allowed: true,
        remaining: 9_998,
        limit: 10_000,
        window: "month",
      });
      expect(redis.incr).toHaveBeenCalledWith(
        expect.stringMatching(/^quota:proj_1:month:\d{4}-\d{2}$/),
      );
    });

    it("prefers a custom daily limit and falls back when it is unset", async () => {
      redis.incr.mockResolvedValue(1);

      await expect(
        checkQuota("proj_1", {
          plan: "CUSTOM",
          customDailyLimit: 5,
          customMonthlyLimit: 50,
        }),
      ).resolves.toMatchObject({ limit: 5, window: "day" });

      await expect(
        checkQuota("proj_1", {
          plan: "CUSTOM",
          customDailyLimit: null,
          customMonthlyLimit: 80,
        }),
      ).resolves.toMatchObject({ limit: 80, window: "month" });

      await expect(
        checkQuota("proj_1", {
          plan: "CUSTOM",
          customDailyLimit: 0,
          customMonthlyLimit: null,
        }),
      ).resolves.toMatchObject({ limit: 100, window: "day" });
    });

    it("fails open when redis cannot increment or expire", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      redis.incr.mockRejectedValueOnce(new Error("down"));

      await expect(checkQuota("proj_1", free)).resolves.toMatchObject({
        allowed: true,
        remaining: 100,
        limit: 100,
        window: "day",
      });

      redis.incr.mockResolvedValue(1);
      redis.expire.mockRejectedValue(new Error("expire failed"));
      await expect(checkQuota("proj_1", free)).resolves.toMatchObject({
        allowed: true,
        remaining: 100,
      });
      expect(spy).toHaveBeenCalledWith(
        "[quota] redis error, failing",
        "open",
        expect.any(Error),
      );
    });

    it("fails closed when configured to deny during a redis outage", async () => {
      env.quotaFailMode = "closed";
      redis.incr.mockRejectedValue(new Error("down"));
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(checkQuota("proj_1", free)).rejects.toBeInstanceOf(ApiError);
      await expect(checkQuota("proj_1", free)).rejects.toMatchObject({
        statusCode: 429,
        code: "quota_exceeded",
        message: "Quota service unavailable",
      });
      expect(spy).toHaveBeenCalledWith(
        "[quota] redis error, failing",
        "closed",
        expect.any(Error),
      );
    });
  });

  describe("getQuotaUsage", () => {
    it("reads the counter without incrementing", async () => {
      redis.get.mockResolvedValue("10");

      await expect(getQuotaUsage("proj_1", free)).resolves.toMatchObject({
        allowed: true,
        remaining: 90,
        limit: 100,
        window: "day",
      });
      expect(redis.incr).not.toHaveBeenCalled();
    });

    it("treats a missing counter as a full window", async () => {
      redis.get.mockResolvedValue(null);

      await expect(getQuotaUsage("proj_1", free)).resolves.toMatchObject({
        allowed: true,
        remaining: 100,
      });
    });

    it("treats a full window as not allowed", async () => {
      redis.get.mockResolvedValueOnce("100").mockResolvedValueOnce("140");

      await expect(getQuotaUsage("proj_1", free)).resolves.toMatchObject({
        allowed: false,
        remaining: 0,
      });
      await expect(getQuotaUsage("proj_1", free)).resolves.toMatchObject({
        allowed: false,
        remaining: 0,
      });
    });

    it("fails open or closed without incrementing", async () => {
      redis.get.mockRejectedValue(new Error("down"));

      await expect(getQuotaUsage("proj_1", free)).resolves.toMatchObject({
        allowed: true,
        remaining: 100,
      });

      env.quotaFailMode = "closed";
      await expect(getQuotaUsage("proj_1", free)).rejects.toMatchObject({
        statusCode: 503,
        code: "quota_unavailable",
        message: "Quota service unavailable",
      });
      expect(redis.incr).not.toHaveBeenCalled();
    });
  });
});
