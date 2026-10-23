import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isValidApiKeyFormat, KEY_PREFIX_BY_ENV } from "@forge/shared";
import { env } from "./env.js";
import { generateKey, hashKey } from "./key-crypto.js";

describe("hashKey", () => {
  it("hashes the pepper and raw key with sha256", () => {
    expect(hashKey("raw-key", "pepper")).toBe(
      createHash("sha256").update("pepperraw-key").digest("hex"),
    );
    expect(hashKey("raw-key", "pepper")).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes the digest when the pepper or key changes", () => {
    expect(hashKey("raw-key", "pepper")).not.toBe(
      hashKey("raw-key", "other-pepper"),
    );
    expect(hashKey("raw-key", "pepper")).not.toBe(
      hashKey("other-key", "pepper"),
    );
  });

  it("uses the process pepper when one is not supplied", () => {
    expect(hashKey("raw-key")).toBe(
      createHash("sha256")
        .update(`${env.apiKeyHashPepper}raw-key`)
        .digest("hex"),
    );
  });
});

describe("generateKey", () => {
  it("builds a valid test or live key", () => {
    const testKey = generateKey("TEST");
    const liveKey = generateKey("LIVE");

    expect(testKey.startsWith(KEY_PREFIX_BY_ENV.TEST)).toBe(true);
    expect(liveKey.startsWith(KEY_PREFIX_BY_ENV.LIVE)).toBe(true);
    expect(isValidApiKeyFormat(testKey)).toBe(true);
    expect(isValidApiKeyFormat(liveKey)).toBe(true);
    expect(testKey).not.toBe(generateKey("TEST"));
  });
});
