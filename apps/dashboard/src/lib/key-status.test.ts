import { describe, expect, it } from "vitest";
import { canRevokeKey, canRotateKey, keyStatus } from "./key-status";

const now = Date.parse("2026-06-01T00:00:00.000Z");

describe("key status", () => {
  it("marks unrevoked unexpired keys active", () => {
    expect(
      keyStatus(
        { revokedAt: null, expiresAt: "2026-07-01T00:00:00.000Z" },
        now,
      ),
    ).toBe("active");
    expect(canRotateKey("active")).toBe(true);
    expect(canRevokeKey("active")).toBe(true);
  });

  it("keeps a rotated key in grace until graceEndsAt", () => {
    expect(
      keyStatus(
        {
          revokedAt: "2026-05-25T00:00:00.000Z",
          graceEndsAt: "2026-06-08T00:00:00.000Z",
        },
        now,
      ),
    ).toBe("grace");
    expect(canRotateKey("grace")).toBe(false);
    expect(canRevokeKey("grace")).toBe(true);
  });

  it("treats a passed expiry as expired even inside grace", () => {
    expect(
      keyStatus(
        {
          revokedAt: "2026-05-25T00:00:00.000Z",
          graceEndsAt: "2026-06-08T00:00:00.000Z",
          expiresAt: "2026-05-31T00:00:00.000Z",
        },
        now,
      ),
    ).toBe("expired");
    expect(canRotateKey("expired")).toBe(false);
    expect(canRevokeKey("expired")).toBe(true);
  });

  it("marks a fully revoked key revoked", () => {
    expect(
      keyStatus(
        {
          revokedAt: "2026-05-01T00:00:00.000Z",
          graceEndsAt: null,
        },
        now,
      ),
    ).toBe("revoked");
    expect(canRevokeKey("revoked")).toBe(false);
  });
});
