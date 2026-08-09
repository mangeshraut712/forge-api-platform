/**
 * ForgeAPI typed SDK — zero-dependency fetch client.
 * Provides a typed wrapper around the ForgeAPI REST endpoints.
 * Fully self-contained: no runtime or type dependencies beyond the global fetch API.
 */

// ---- Shared types (inlined so the SDK is publishable standalone) ----

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TodoListResponse = {
  data: Todo[];
  nextCursor: string | null;
};

export type CreateTodoInput = {
  title: string;
  completed?: boolean;
};

export type UpdateTodoInput = {
  title?: string;
  completed?: boolean;
};

export type ListTodosQuery = {
  limit?: number;
  cursor?: string;
};

export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    request_id?: string;
    details?: unknown;
  };
};

// ---- Client options ----

export type ForgeClientOptions = {
  /** The API key issued from the dashboard (forge_test_... or forge_live_...). */
  apiKey: string;
  /** Base URL of the ForgeAPI server. Defaults to http://localhost:4000. */
  baseUrl?: string;
  /** Custom fetch implementation (e.g. for tests). Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Default request timeout in ms. */
  timeoutMs?: number;
  /** Max retries for safe (GET) requests. Defaults to 2. */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms. Defaults to 200. */
  retryBaseDelayMs?: number;
};

const API_KEY_PATTERN = /^forge_(test|live)_[a-f0-9]{48}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeApiErrorBody(
  payload: unknown,
  status: number,
  requestId?: string,
): ApiErrorBody {
  const error =
    isRecord(payload) && isRecord(payload.error) ? payload.error : null;
  const code =
    typeof error?.code === "string"
      ? error.code
      : status >= 500
        ? "internal_error"
        : "unknown_error";
  const message =
    typeof error?.message === "string"
      ? error.message
      : `Request failed with status ${status}`;
  const body: ApiErrorBody = {
    error: {
      code,
      message,
    },
  };

  const bodyRequestId =
    typeof error?.request_id === "string" ? error.request_id : requestId;
  if (bodyRequestId) body.error.request_id = bodyRequestId;
  if (error && "details" in error) body.error.details = error.details;
  return body;
}

export class ForgeApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(body: ApiErrorBody, status: number) {
    super(body.error.message);
    this.name = "ForgeApiError";
    this.status = status;
    this.code = body.error.code;
    this.requestId = body.error.request_id;
    this.details = body.error.details;
  }
}

export class ForgeClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(opts: ForgeClientOptions) {
    if (!opts.apiKey) {
      throw new Error("ForgeClient: apiKey is required");
    }
    if (!API_KEY_PATTERN.test(opts.apiKey)) {
      throw new Error("ForgeClient: apiKey must be a valid ForgeAPI key");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "http://localhost:4000").replace(/\/$/, "");
    this.fetchFn = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 30_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.retryBaseDelayMs = opts.retryBaseDelayMs ?? 200;
  }

  // ---- Todos ----

  async listTodos(query?: Partial<ListTodosQuery>): Promise<TodoListResponse> {
    const params = new URLSearchParams();
    if (query?.limit != null) params.set("limit", String(query.limit));
    if (query?.cursor) params.set("cursor", query.cursor);
    const qs = params.toString();
    return this.request<TodoListResponse>(
      "GET",
      qs ? `/v1/todos?${qs}` : "/v1/todos",
    );
  }

  async getTodo(id: string): Promise<Todo> {
    return this.request<Todo>("GET", `/v1/todos/${encodeURIComponent(id)}`);
  }

  async createTodo(
    input: CreateTodoInput,
    idempotencyKey?: string,
  ): Promise<Todo> {
    return this.request<Todo>("POST", "/v1/todos", {
      body: JSON.stringify(input),
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    });
  }

  async updateTodo(
    id: string,
    input: UpdateTodoInput,
    idempotencyKey?: string,
  ): Promise<Todo> {
    return this.request<Todo>("PUT", `/v1/todos/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    });
  }

  async patchTodo(
    id: string,
    input: UpdateTodoInput,
    idempotencyKey?: string,
  ): Promise<Todo> {
    return this.request<Todo>("PATCH", `/v1/todos/${encodeURIComponent(id)}`, {
      body: JSON.stringify(input),
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
    });
  }

  async deleteTodo(id: string): Promise<void> {
    await this.request<void>("DELETE", `/v1/todos/${encodeURIComponent(id)}`);
  }

  // ---- Internal request helper ----

  private async request<T>(
    method: string,
    path: string,
    init?: { body?: string; headers?: Record<string, string> },
  ): Promise<T> {
    // Only retry safe (idempotent) methods
    const isSafe = method === "GET";
    const maxAttempts = isSafe ? this.maxRetries + 1 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const res = await this.fetchFn(`${this.baseUrl}${path}`, {
          method,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
            ...(init?.headers ?? {}),
          },
          ...(init?.body ? { body: init.body } : {}),
        });

        if (res.status === 204) {
          return undefined as T;
        }

        const json = await res.json().catch(() => undefined);

        if (!res.ok) {
          // Retry on 429 (rate limited) and 5xx for safe requests
          if (
            isSafe &&
            attempt < maxAttempts - 1 &&
            (res.status === 429 || res.status >= 500)
          ) {
            const delay = this.retryBaseDelayMs * 2 ** attempt;
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          const requestId = res.headers.get("X-Request-Id") ?? undefined;
          throw new ForgeApiError(
            normalizeApiErrorBody(json, res.status, requestId),
            res.status,
          );
        }

        return json as T;
      } catch (err) {
        // Retry on network errors / timeouts for safe requests
        if (
          isSafe &&
          attempt < maxAttempts - 1 &&
          !(err instanceof ForgeApiError)
        ) {
          const delay = this.retryBaseDelayMs * 2 ** attempt;
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }

    // Unreachable — loop always returns or throws
    throw new Error("Unreachable");
  }
}

/** Convenience factory function. */
export function createForgeClient(opts: ForgeClientOptions): ForgeClient {
  return new ForgeClient(opts);
}
