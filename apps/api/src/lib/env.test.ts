import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

async function loadEnv(
  overrides: Record<string, string | undefined>,
): Promise<typeof import("./env.js")> {
  process.env = { ...originalEnvironment };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  vi.resetModules();
  return import("./env.js");
}

describe("API environment validation", () => {
  it("rejects invalid quota fail modes", async () => {
    await expect(
      loadEnv({ NODE_ENV: "test", QUOTA_FAIL_MODE: "sometimes" }),
    ).rejects.toThrow('QUOTA_FAIL_MODE must be either "open" or "closed"');
    await expect(
      loadEnv({ NODE_ENV: "test", QUOTA_FAIL_MODE: "" }),
    ).rejects.toThrow('QUOTA_FAIL_MODE must be either "open" or "closed"');
  });

  it("requires a strong key pepper in production", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", API_KEY_HASH_PEPPER: "too-short" }),
    ).rejects.toThrow(
      "API_KEY_HASH_PEPPER must be at least 32 characters in production",
    );
    await expect(
      loadEnv({
        NODE_ENV: "production",
        API_KEY_HASH_PEPPER: "p".repeat(31),
      }),
    ).rejects.toThrow(
      "API_KEY_HASH_PEPPER must be at least 32 characters in production",
    );
  });

  it.each(["70000", "0", "1.5", "-1", "abc", ""])(
    "rejects invalid port %s",
    async (port) => {
      await expect(loadEnv({ NODE_ENV: "test", PORT: port })).rejects.toThrow(
        "PORT must be an integer between 1 and 65535",
      );
    },
  );

  it("accepts production configuration and parses origin lists", async () => {
    const loaded = await loadEnv({
      NODE_ENV: "production",
      API_KEY_HASH_PEPPER: "p".repeat(32),
      QUOTA_FAIL_MODE: "closed",
      PORT: "8080",
      HOST: "127.0.0.1",
      CORS_ORIGINS: " https://a.example , ,https://b.example ",
      DATABASE_URL: "postgresql://example/forge",
      REDIS_URL: "redis://example:6379",
    });

    expect(loaded.env).toMatchObject({
      nodeEnv: "production",
      isProd: true,
      port: 8080,
      host: "127.0.0.1",
      apiKeyHashPepper: "p".repeat(32),
      quotaFailMode: "closed",
      trustProxy: false,
      corsOrigins: ["https://a.example", "https://b.example"],
      databaseUrl: "postgresql://example/forge",
      redisUrl: "redis://example:6379",
    });
  });

  it("accepts the edge of the port range", async () => {
    const low = await loadEnv({ NODE_ENV: "test", PORT: "1" });
    expect(low.env.port).toBe(1);
    const high = await loadEnv({ NODE_ENV: "test", PORT: "65535" });
    expect(high.env.port).toBe(65535);
  });

  it("falls back when optional configuration is absent", async () => {
    const loaded = await loadEnv({
      NODE_ENV: undefined,
      PORT: undefined,
      HOST: undefined,
      CORS_ORIGINS: undefined,
      DATABASE_URL: undefined,
      REDIS_URL: undefined,
      QUOTA_FAIL_MODE: undefined,
      API_KEY_HASH_PEPPER: undefined,
    });

    expect(loaded.env).toMatchObject({
      nodeEnv: "development",
      isProd: false,
      port: 4000,
      host: "0.0.0.0",
      corsOrigins: ["http://localhost:3000", "http://localhost:3001"],
      databaseUrl:
        "postgresql://forge:forge@localhost:5432/forge?schema=public",
      redisUrl: "redis://localhost:6379",
      quotaFailMode: "open",
      apiKeyHashPepper: "",
      trustProxy: false,
    });
  });

  it("parses the trusted proxy hop count and rejects junk", async () => {
    const loaded = await loadEnv({ NODE_ENV: "test", TRUST_PROXY: "1" });
    expect(loaded.env.trustProxy).toBe(1);
    const disabled = await loadEnv({ NODE_ENV: "test", TRUST_PROXY: "false" });
    expect(disabled.env.trustProxy).toBe(false);
    await expect(
      loadEnv({ NODE_ENV: "test", TRUST_PROXY: "yes" }),
    ).rejects.toThrow(
      'TRUST_PROXY must be "true", "false", or a hop count from 0 to 10',
    );
  });

  it("uses the default origins when CORS_ORIGINS is empty", async () => {
    const loaded = await loadEnv({ NODE_ENV: "test", CORS_ORIGINS: "" });
    expect(loaded.env.corsOrigins).toEqual([
      "http://localhost:3000",
      "http://localhost:3001",
    ]);
  });

  it("allows a short pepper outside production", async () => {
    const loaded = await loadEnv({
      NODE_ENV: "test",
      API_KEY_HASH_PEPPER: "short",
    });
    expect(loaded.env.isProd).toBe(false);
    expect(loaded.env.apiKeyHashPepper).toBe("short");
  });
});
