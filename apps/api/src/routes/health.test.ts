import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { buildServer } from "../index.js";
import { healthRoutes } from "./health.js";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    queryRaw: vi.fn(),
    ping: vi.fn(),
  },
}));

vi.mock("@forge/db", () => ({
  prisma: {
    $queryRaw: (...args: unknown[]) => mocks.queryRaw(...args),
  },
}));

vi.mock("../lib/redis.js", () => ({
  getRedis: () => ({
    ping: (...args: unknown[]) => mocks.ping(...args),
  }),
  closeRedis: vi.fn(),
}));

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/;

describe("health routes", () => {
  beforeEach(() => {
    mocks.queryRaw.mockReset();
    mocks.ping.mockReset();
    mocks.queryRaw.mockResolvedValue([{ ok: 1 }]);
    mocks.ping.mockResolvedValue("PONG");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("unit", () => {
    it("reports liveness without checking dependencies", async () => {
      const app = Fastify({ logger: false });
      await healthRoutes(app);

      const response = await app.inject({ method: "GET", url: "/health" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "ok" });
      expect(response.json().timestamp).toMatch(ISO_TIMESTAMP);
      expect(mocks.queryRaw).not.toHaveBeenCalled();
      expect(mocks.ping).not.toHaveBeenCalled();
      await app.close();
    });

    it("reports ready when postgres and redis both respond", async () => {
      const app = Fastify({ logger: false });
      const warn = vi.spyOn(app.log, "warn");
      await healthRoutes(app);

      const response = await app.inject({ method: "GET", url: "/ready" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "ready" });
      expect(response.json().timestamp).toMatch(ISO_TIMESTAMP);
      expect(warn).not.toHaveBeenCalled();
      await app.close();
    });

    it.each([
      ["database", "rejected", "fulfilled"],
      ["redis", "fulfilled", "rejected"],
      ["both", "rejected", "rejected"],
    ] as const)(
      "returns 503 when the %s check fails",
      async (_label, database, redis) => {
        const app = Fastify({ logger: false });
        const warn = vi.spyOn(app.log, "warn");
        await healthRoutes(app);
        if (database === "rejected") {
          mocks.queryRaw.mockRejectedValue(new Error("db down"));
        }
        if (redis === "rejected") {
          mocks.ping.mockRejectedValue(new Error("redis down"));
        }

        const response = await app.inject({ method: "GET", url: "/ready" });

        expect(response.statusCode).toBe(503);
        expect(response.json()).toEqual({
          status: "not_ready",
          timestamp: expect.stringMatching(ISO_TIMESTAMP),
        });
        expect(JSON.stringify(response.json())).not.toContain("down");
        expect(warn).toHaveBeenCalledWith(
          { database, redis },
          "readiness check failed",
        );
        await app.close();
      },
    );
  });

  describe("through the server", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
      app = await buildServer();
    });

    afterAll(async () => {
      await app.close();
    });

    it("serves readiness without authentication", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/ready",
        headers: { authorization: "Bearer" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: "ready" });
    });

    it("serves liveness when a dependency is down", async () => {
      mocks.ping.mockRejectedValue(new Error("redis down"));

      const ready = await app.inject({ method: "GET", url: "/ready" });
      const health = await app.inject({ method: "GET", url: "/health" });

      expect(ready.statusCode).toBe(503);
      expect(ready.json()).toMatchObject({ status: "not_ready" });
      expect(health.statusCode).toBe(200);
      expect(health.json()).toMatchObject({ status: "ok" });
    });

    it("turns a synchronous dependency failure into an internal error", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.queryRaw.mockImplementation(() => {
        throw new Error("sync failure");
      });

      const response = await app.inject({ method: "GET", url: "/ready" });

      expect(response.statusCode).toBe(500);
      expect(response.json().error).toMatchObject({
        code: "internal_error",
        message: "Internal server error",
      });
      expect(JSON.stringify(response.json())).not.toContain("sync failure");
      expect(spy).toHaveBeenCalled();
    });
  });
});
