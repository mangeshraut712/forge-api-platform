import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidApiKeyFormat, visibleKeyPrefix } from "@forge/shared";
import { hashKey, generateKey } from "../lib/key-crypto.js";
import {
  createApiKey,
  revokeApiKey,
  rotateApiKey,
  verifyApiKey,
} from "./key-service.js";

const { prisma, issuedSecret } = vi.hoisted(() => ({
  prisma: {
    apiKey: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
  // 24 bytes, matching KEY_SECRET_BYTES, so generated keys are deterministic.
  issuedSecret: Buffer.alloc(24, 0xab),
}));

vi.mock("@forge/db", () => ({ prisma }));

vi.mock("node:crypto", async () => {
  const actual =
    await vi.importActual<typeof import("node:crypto")>("node:crypto");
  return {
    ...actual,
    randomBytes: (size: number) =>
      size === issuedSecret.length
        ? Buffer.from(issuedSecret)
        : actual.randomBytes(size),
  };
});

const issuedLiveToken = `forge_live_${issuedSecret.toString("hex")}`;

const NOW = new Date("2026-06-01T00:00:00.000Z");

function keyRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "key_1",
    projectId: "proj_1",
    name: "ci",
    environment: "TEST" as const,
    keyPrefix: "forge_test_aaaaa",
    keyHash: "hash",
    scopes: ["todos:read", "todos:write"],
    expiresAt: null as Date | null,
    revokedAt: null as Date | null,
    lastUsedAt: null as Date | null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    rotatedFromId: null as string | null,
    graceEndsAt: null as Date | null,
    project: {
      id: "proj_1",
      name: "Demo",
      slug: "demo",
      plan: "FREE" as const,
      customDailyLimit: null as number | null,
      customMonthlyLimit: null as number | null,
    },
    ...overrides,
  };
}

describe("key service", () => {
  beforeEach(() => {
    prisma.apiKey.findFirst.mockReset();
    prisma.apiKey.update.mockReset();
    prisma.apiKey.create.mockReset();
    prisma.$transaction.mockReset();
    prisma.apiKey.update.mockResolvedValue({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("verifyApiKey", () => {
    it("rejects a malformed key before querying", async () => {
      await expect(verifyApiKey("nope")).rejects.toMatchObject({
        statusCode: 401,
        code: "unauthorized",
        message: "Invalid API key format",
      });
      expect(prisma.apiKey.findFirst).not.toHaveBeenCalled();
    });

    it("rejects an unknown key", async () => {
      const raw = generateKey("TEST");
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(verifyApiKey(raw)).rejects.toMatchObject({
        statusCode: 401,
        message: "Unknown API key",
      });
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { keyHash: hashKey(raw) },
        include: {
          project: {
            select: {
              id: true,
              name: true,
              slug: true,
              plan: true,
              customDailyLimit: true,
              customMonthlyLimit: true,
            },
          },
        },
      });
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("returns the auth context and records last use", async () => {
      const raw = generateKey("TEST");
      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({ scopes: ["todos:write"] }),
      );

      await expect(verifyApiKey(raw)).resolves.toEqual({
        project: keyRecord().project,
        apiKey: {
          id: "key_1",
          name: "ci",
          environment: "TEST",
          scopes: ["todos:write"],
        },
        scopes: ["todos:write"],
      });
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_1" },
        data: { lastUsedAt: expect.any(Date) },
      });
    });

    it("still authenticates when the last-use update fails", async () => {
      const raw = generateKey("TEST");
      prisma.apiKey.findFirst.mockResolvedValue(keyRecord());
      prisma.apiKey.update.mockRejectedValue(new Error("write failed"));

      await expect(verifyApiKey(raw)).resolves.toMatchObject({
        apiKey: { id: "key_1" },
      });
      await new Promise((resolve) => setImmediate(resolve));
    });

    it("rejects a revoked key with no remaining grace", async () => {
      const raw = generateKey("TEST");
      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          revokedAt: new Date("2026-01-01T00:00:00.000Z"),
          graceEndsAt: null,
        }),
      );

      await expect(verifyApiKey(raw)).rejects.toMatchObject({
        statusCode: 403,
        code: "key_revoked",
        message: "API key has been revoked",
      });
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });

    it("honors the grace and expiry boundaries", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const raw = generateKey("LIVE");

      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          environment: "LIVE",
          revokedAt: new Date("2026-05-01T00:00:00.000Z"),
          graceEndsAt: new Date("2026-06-01T00:00:00.001Z"),
        }),
      );
      await expect(verifyApiKey(raw)).resolves.toMatchObject({
        apiKey: { environment: "LIVE" },
      });

      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          revokedAt: new Date("2026-05-01T00:00:00.000Z"),
          graceEndsAt: NOW,
        }),
      );
      await expect(verifyApiKey(raw)).rejects.toMatchObject({
        code: "key_revoked",
      });

      prisma.apiKey.findFirst.mockResolvedValue(keyRecord({ expiresAt: NOW }));
      await expect(verifyApiKey(raw)).resolves.toMatchObject({
        apiKey: { id: "key_1" },
      });

      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({ expiresAt: new Date("2026-05-31T23:59:59.999Z") }),
      );
      await expect(verifyApiKey(raw)).rejects.toMatchObject({
        statusCode: 403,
        code: "key_expired",
        message: "API key has expired",
      });
    });

    it("reports revocation before expiry", async () => {
      const raw = generateKey("TEST");
      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          revokedAt: new Date("2026-01-01T00:00:00.000Z"),
          graceEndsAt: null,
          expiresAt: new Date("2026-01-02T00:00:00.000Z"),
        }),
      );

      await expect(verifyApiKey(raw)).rejects.toMatchObject({
        code: "key_revoked",
      });
    });
  });

  describe("createApiKey", () => {
    it("persists a hashed live key and returns the raw secret once", async () => {
      const record = { id: "key_new" };
      const expiresAt = new Date("2027-01-01T00:00:00.000Z");
      prisma.apiKey.create.mockResolvedValue(record);

      const result = await createApiKey({
        projectId: "proj_1",
        name: "ci",
        environment: "LIVE",
        scopes: ["todos:read"],
        expiresAt,
      });

      expect(result.record).toBe(record);
      expect(result.rawKey).toBe(issuedLiveToken);
      expect(isValidApiKeyFormat(result.rawKey)).toBe(true);
      // Hash the known issued token rather than result.rawKey. CodeQL treats
      // the return value of createApiKey as a password (CWE-916). The value is
      // 192 bits from randomBytes and is stored as SHA-256(pepper || token).
      expect(prisma.apiKey.create).toHaveBeenCalledWith({
        data: {
          projectId: "proj_1",
          name: "ci",
          environment: "LIVE",
          keyPrefix: visibleKeyPrefix(issuedLiveToken),
          keyHash: hashKey(issuedLiveToken),
          scopes: ["todos:read"],
          expiresAt,
        },
      });
    });

    it("omits expiry when it is null or absent", async () => {
      prisma.apiKey.create.mockResolvedValue({ id: "key_new" });

      await createApiKey({
        projectId: "proj_1",
        name: "ci",
        environment: "TEST",
        scopes: ["todos:write"],
        expiresAt: null,
      });

      const payload = prisma.apiKey.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(payload.data.expiresAt).toBeUndefined();
      expect(payload.data.environment).toBe("TEST");
    });
  });

  describe("revokeApiKey", () => {
    it("marks a project key revoked", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(keyRecord());
      prisma.apiKey.update.mockResolvedValue({ id: "key_1" });

      await expect(revokeApiKey("proj_1", "key_1")).resolves.toEqual({
        id: "key_1",
      });
      expect(prisma.apiKey.findFirst).toHaveBeenCalledWith({
        where: { id: "key_1", projectId: "proj_1" },
      });
      expect(prisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_1" },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it("rejects an unknown key", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(revokeApiKey("proj_1", "missing")).rejects.toMatchObject({
        statusCode: 404,
        code: "not_found",
        message: "API key not found",
      });
      expect(prisma.apiKey.update).not.toHaveBeenCalled();
    });
  });

  describe("rotateApiKey", () => {
    it("revokes the old key for seven days and links the replacement", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const expiresAt = new Date("2027-01-01T00:00:00.000Z");
      const tx = {
        apiKey: {
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({ id: "key_2" }),
        },
      };
      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          environment: "LIVE",
          scopes: ["todos:read"],
          expiresAt,
        }),
      );
      prisma.$transaction.mockImplementation(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      );

      const result = await rotateApiKey("proj_1", "key_1");

      expect(result.record).toEqual({ id: "key_2" });
      expect(result.rawKey).toBe(issuedLiveToken);
      expect(isValidApiKeyFormat(result.rawKey)).toBe(true);
      expect(tx.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_1" },
        data: {
          revokedAt: NOW,
          graceEndsAt: new Date("2026-06-08T00:00:00.000Z"),
        },
      });
      const payload = tx.apiKey.create.mock.calls[0]?.[0] as {
        data: Record<string, unknown>;
      };
      expect(payload.data).toMatchObject({
        projectId: "proj_1",
        name: "ci",
        environment: "LIVE",
        scopes: ["todos:read"],
        rotatedFromId: "key_1",
        expiresAt,
        keyHash: hashKey(issuedLiveToken),
        keyPrefix: visibleKeyPrefix(issuedLiveToken),
      });
      expect(payload.data).not.toHaveProperty("revokedAt");
      expect(payload.data).not.toHaveProperty("graceEndsAt");
    });

    it("honors a custom grace period", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const tx = {
        apiKey: {
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({ id: "key_2" }),
        },
      };
      prisma.apiKey.findFirst.mockResolvedValue(keyRecord());
      prisma.$transaction.mockImplementation(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      );

      await rotateApiKey("proj_1", "key_1", 1);

      expect(tx.apiKey.update).toHaveBeenCalledWith({
        where: { id: "key_1" },
        data: {
          revokedAt: NOW,
          graceEndsAt: new Date("2026-06-02T00:00:00.000Z"),
        },
      });
    });

    it("rejects a missing key", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(rotateApiKey("proj_1", "missing")).rejects.toMatchObject({
        statusCode: 404,
        code: "not_found",
        message: "API key not found",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a key whose grace has ended", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          revokedAt: new Date("2026-05-01T00:00:00.000Z"),
          graceEndsAt: NOW,
        }),
      );

      await expect(rotateApiKey("proj_1", "key_1")).rejects.toMatchObject({
        statusCode: 409,
        code: "conflict",
        message: "Cannot rotate a revoked key",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rejects a revoked key that never had grace", async () => {
      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          revokedAt: new Date("2026-05-01T00:00:00.000Z"),
          graceEndsAt: null,
        }),
      );

      await expect(rotateApiKey("proj_1", "key_1")).rejects.toMatchObject({
        code: "conflict",
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("rotates a key that is still inside its grace window", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      const tx = {
        apiKey: {
          update: vi.fn().mockResolvedValue({}),
          create: vi.fn().mockResolvedValue({ id: "key_2" }),
        },
      };
      prisma.apiKey.findFirst.mockResolvedValue(
        keyRecord({
          revokedAt: new Date("2026-05-25T00:00:00.000Z"),
          graceEndsAt: new Date("2026-06-02T00:00:00.000Z"),
        }),
      );
      prisma.$transaction.mockImplementation(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      );

      await expect(rotateApiKey("proj_1", "key_1")).resolves.toMatchObject({
        record: { id: "key_2" },
      });
      expect(tx.apiKey.update).toHaveBeenCalled();
    });
  });
});
