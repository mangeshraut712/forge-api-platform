/**
 * SDK unit tests — mock fetch to verify request construction and response parsing.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createForgeClient, ForgeApiError } from "@mangeshraut/forge-sdk";
import type { ApiErrorBody } from "@mangeshraut/forge-sdk";

function mockFetch(response: Response) {
  return vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("ForgeClient", () => {
  it("requires an API key", () => {
    expect(() => createForgeClient({ apiKey: "" })).toThrow(
      "apiKey is required",
    );
  });

  it("rejects API keys with an invalid format", () => {
    expect(() => createForgeClient({ apiKey: "not-a-valid-key" })).toThrow(
      "apiKey must be a valid ForgeAPI key",
    );
  });

  it("lists todos with query params", async () => {
    const fetchFn = mockFetch(
      jsonResponse({
        data: [
          {
            id: "todo-1",
            title: "Test",
            completed: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
        nextCursor: null,
      }),
    );

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
    });

    const result = await client.listTodos({ limit: 5 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.title).toBe("Test");
    expect(result.nextCursor).toBeNull();

    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const calledUrl = call?.[0] as string;
    expect(calledUrl).toContain("limit=5");
  });

  it("creates a todo with idempotency key", async () => {
    const fetchFn = mockFetch(
      jsonResponse(
        {
          id: "todo-1",
          title: "New",
          completed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        201,
      ),
    );

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
    });

    const result = await client.createTodo({ title: "New" }, "idem-key-1");

    expect(result.id).toBe("todo-1");

    const callArgs = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const opts = callArgs?.[1] as RequestInit;
    expect(opts.headers).toHaveProperty("Idempotency-Key", "idem-key-1");
    expect(opts.method).toBe("POST");
  });

  it("throws ForgeApiError on non-2xx", async () => {
    const errorBody: ApiErrorBody = {
      error: {
        code: "unauthorized",
        message: "Invalid API key",
        request_id: "req-123",
      },
    };

    // Fresh Response per call — a Response body can only be consumed once.
    const fetchFn = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(errorBody, 401)),
      ) as unknown as typeof fetch;

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
    });

    await expect(client.listTodos()).rejects.toThrow(ForgeApiError);
    await expect(client.listTodos()).rejects.toMatchObject({
      status: 401,
      code: "unauthorized",
      requestId: "req-123",
    });
  });

  it("normalizes malformed error responses into ForgeApiError", async () => {
    const fetchFn = mockFetch(new Response("upstream failed", { status: 502 }));

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
      maxRetries: 0,
    });

    await expect(client.listTodos()).rejects.toMatchObject({
      name: "ForgeApiError",
      status: 502,
      code: "internal_error",
      message: "Request failed with status 502",
    });
  });

  it("patches a todo with PATCH method", async () => {
    const fetchFn = mockFetch(
      jsonResponse({
        id: "todo-1",
        title: "Patched",
        completed: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    );

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
    });

    const result = await client.patchTodo("todo-1", { completed: true });

    expect(result.completed).toBe(true);

    const callArgs = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const opts = callArgs?.[1] as RequestInit;
    expect(opts.method).toBe("PATCH");
  });

  it("retries GET on 429 with exponential backoff", async () => {
    const errorBody: ApiErrorBody = {
      error: { code: "quota_exceeded", message: "Quota exceeded" },
    };
    // First call returns 429, second returns success
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(errorBody, 429))
      .mockResolvedValueOnce(
        jsonResponse({ data: [], nextCursor: null }),
      ) as unknown as typeof fetch;

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
      maxRetries: 1,
      retryBaseDelayMs: 1,
    });

    const result = await client.listTodos();
    expect(result.data).toEqual([]);
    expect(
      (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(2);
  });

  it("does not retry POST on 429 (unsafe method)", async () => {
    const errorBody: ApiErrorBody = {
      error: { code: "quota_exceeded", message: "Quota exceeded" },
    };
    const fetchFn = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(errorBody, 429)),
      ) as unknown as typeof fetch;

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
      maxRetries: 2,
      retryBaseDelayMs: 1,
    });

    await expect(client.createTodo({ title: "Test" })).rejects.toThrow(
      ForgeApiError,
    );
    expect(
      (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls.length,
    ).toBe(1);
  });

  it("handles 204 No Content for delete", async () => {
    const fetchFn = mockFetch(new Response(null, { status: 204 }));

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      fetchImpl: fetchFn,
    });

    await expect(client.deleteTodo("todo-1")).resolves.toBeUndefined();

    const callArgs = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0];
    const opts = callArgs?.[1] as RequestInit;
    expect(opts.headers).not.toHaveProperty("Content-Type");
  });

  it("uses custom base URL", async () => {
    const fetchFn = mockFetch(jsonResponse({ data: [], nextCursor: null }));

    const client = createForgeClient({
      apiKey: "forge_test_" + "a".repeat(48),
      baseUrl: "http://api.example.com/",
      fetchImpl: fetchFn,
    });

    await client.listTodos({ limit: 20 });

    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    const calledUrl = call?.[0] as string;
    expect(calledUrl).toBe("http://api.example.com/v1/todos?limit=20");
  });
});
