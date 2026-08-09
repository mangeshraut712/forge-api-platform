import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
  vi.resetModules();
});

async function loadEnv(overrides: Record<string, string>): Promise<void> {
  process.env = { ...originalEnvironment, ...overrides };
  vi.resetModules();
  await import("./env.js");
}

describe("API environment validation", () => {
  it("rejects invalid quota fail modes", async () => {
    await expect(
      loadEnv({ NODE_ENV: "test", QUOTA_FAIL_MODE: "sometimes" }),
    ).rejects.toThrow('QUOTA_FAIL_MODE must be either "open" or "closed"');
  });

  it("requires a strong key pepper in production", async () => {
    await expect(
      loadEnv({ NODE_ENV: "production", API_KEY_HASH_PEPPER: "too-short" }),
    ).rejects.toThrow(
      "API_KEY_HASH_PEPPER must be at least 32 characters in production",
    );
  });

  it("rejects invalid ports", async () => {
    await expect(loadEnv({ NODE_ENV: "test", PORT: "70000" })).rejects.toThrow(
      "PORT must be an integer between 1 and 65535",
    );
  });
});
