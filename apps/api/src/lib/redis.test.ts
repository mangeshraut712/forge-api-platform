import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type FakeRedis = {
  url: string;
  options: unknown;
  handlers: Map<string, (err: Error) => void>;
  quit: ReturnType<typeof vi.fn>;
  on: (event: string, handler: (err: Error) => void) => FakeRedis;
};

const redisState = vi.hoisted(() => ({
  instances: [] as FakeRedis[],
}));

vi.mock("ioredis", () => {
  class Redis {
    url: string;
    options: unknown;
    handlers = new Map<string, (err: Error) => void>();
    quit = vi.fn(async () => "OK");

    constructor(url: string, options: unknown) {
      this.url = url;
      this.options = options;
      redisState.instances.push(this);
    }

    on(event: string, handler: (err: Error) => void): this {
      this.handlers.set(event, handler);
      return this;
    }
  }

  return { Redis };
});

async function loadRedis(): Promise<typeof import("./redis.js")> {
  vi.resetModules();
  return import("./redis.js");
}

describe("redis client", () => {
  beforeEach(() => {
    redisState.instances.length = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reuses one client until it is closed", async () => {
    const { getRedis, closeRedis } = await loadRedis();
    const { env } = await import("./env.js");

    const first = getRedis();
    const second = getRedis();

    expect(first).toBe(second);
    expect(redisState.instances).toHaveLength(1);
    expect(redisState.instances[0]?.url).toBe(env.redisUrl);
    expect(redisState.instances[0]?.options).toEqual({
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });

    await closeRedis();
    expect(redisState.instances[0]?.quit).toHaveBeenCalledOnce();

    const third = getRedis();
    expect(third).not.toBe(first);
    expect(redisState.instances).toHaveLength(2);
  });

  it("does nothing when close is called before a client exists", async () => {
    const { closeRedis } = await loadRedis();
    await expect(closeRedis()).resolves.toBeUndefined();
    expect(redisState.instances).toHaveLength(0);
  });

  it("logs client errors without throwing", async () => {
    const { getRedis } = await loadRedis();
    getRedis();
    const handler = redisState.instances[0]?.handlers.get("error");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(handler).toEqual(expect.any(Function));
    handler?.(new Error("ECONNREFUSED"));

    expect(spy).toHaveBeenCalledWith("[redis] error:", "ECONNREFUSED");
  });
});
