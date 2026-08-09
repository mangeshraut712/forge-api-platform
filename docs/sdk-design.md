# SDK Design

## Overview

`@mangeshraut/forge-sdk` is a zero-dependency, typed fetch client for the ForgeAPI platform. It's designed to be consumed by external applications (like the todo-demo) without requiring any framework or runtime dependencies.

## Usage

```typescript
import { createForgeClient } from "@mangeshraut/forge-sdk";

const client = createForgeClient({
  apiKey: process.env.FORGE_API_KEY!,
  baseUrl: "http://localhost:4000", // optional, defaults to localhost:4000
});

// Create a todo
const todo = await client.createTodo({ title: "Ship SDK" });

// List todos (cursor pagination)
const list = await client.listTodos({ limit: 20 });

// Get single todo
const one = await client.getTodo(todo.id);

// Update (full replace)
await client.updateTodo(todo.id, { title: "Ship SDK v2", completed: true });

// Delete
await client.deleteTodo(todo.id);
```

## Configuration Options

| Option             | Type           | Default                 | Description                                    |
| ------------------ | -------------- | ----------------------- | ---------------------------------------------- |
| `apiKey`           | `string`       | required                | The API key (forge_test_... or forge_live_...) |
| `baseUrl`          | `string`       | `http://localhost:4000` | Base URL of the ForgeAPI server                |
| `fetchImpl`        | `typeof fetch` | `globalThis.fetch`      | Custom fetch (for tests)                       |
| `timeoutMs`        | `number`       | `30000`                 | Request timeout in ms                          |
| `maxRetries`       | `number`       | `2`                     | Max retries for safe (GET) requests            |
| `retryBaseDelayMs` | `number`       | `200`                   | Base delay for exponential backoff             |

## Error Handling

All non-2xx responses throw `ForgeApiError`:

```typescript
class ForgeApiError extends Error {
  status: number; // HTTP status code
  code: string; // error code (e.g. "unauthorized", "quota_exceeded")
  requestId?: string; // request ID for correlation
  details?: unknown; // optional error details
}
```

Example:

```typescript
try {
  await client.listTodos();
} catch (err) {
  if (err instanceof ForgeApiError) {
    console.error(`Error ${err.status}: ${err.code} — ${err.message}`);
    console.error(`Request ID: ${err.requestId}`);
  }
}
```

## Retry Behavior

- **Safe methods (GET)** — retried up to `maxRetries` times with exponential backoff on:
  - Network errors / timeouts
  - HTTP 429 (rate limited)
  - HTTP 5xx (server errors)
- **Unsafe methods (POST/PUT/DELETE)** — never retried automatically (to avoid duplicate side effects). Use the `Idempotency-Key` header for safe retries.

## Idempotency

POST, PUT, and PATCH accept an optional `Idempotency-Key` header:

```typescript
const todo = await client.createTodo(
  { title: "Create once" },
  "my-unique-key-123", // idempotency key
);
```

Retries with the same key + body return the original response. A different body with the same key returns a 409 conflict.

## Pagination

`listTodos` returns a cursor-based paginated response:

```typescript
type TodoListResponse = {
  data: Todo[];
  nextCursor: string | null; // null when no more pages
};

// Fetch next page
const page2 = await client.listTodos({ limit: 20, cursor: page1.nextCursor });
```

## Design Principles

1. **Zero dependencies** — the SDK uses only the global `fetch` API, so it works in Node 18+, browsers, and edge runtimes.
2. **Typed public contract** — the standalone SDK keeps its public request/response models inlined so consumers do not install the server-side `@forge/shared` package; API and SDK behavior are covered by the workspace contract tests.
3. **Fail fast** — invalid API keys throw immediately at construction.
4. **Safe retries only** — never auto-retry non-idempotent operations.
5. **Correlation** — every error carries a `requestId` for debugging.
6. **Configurable** — base URL, timeout, retries, and fetch are all injectable for testing and different environments.
