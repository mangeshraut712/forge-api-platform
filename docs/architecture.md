# ForgeAPI Architecture

## Overview

ForgeAPI is a developer platform with two planes:

1. **Control plane** — the Next.js dashboard where users sign in (Google OAuth or dev credentials), create projects, manage API keys, view usage metrics, and inspect request logs.
2. **Data plane** — the Fastify REST API that external applications call using generated API keys. It enforces authentication, scopes, and request quotas.

```
Google OAuth / Dev Login
          ↓
   Developer Dashboard (Next.js :3000)
          ↓
   Projects / API Keys / Usage / Quotas
          ↓
   REST API (Fastify :4000)
          ↓
   Auth + Key Validation + Quota Middleware
          ↓
   PostgreSQL (Prisma) + Redis (quotas)
          ↓
   @mangeshraut/forge-sdk (typed client)
          ↓
   Todo Consumer App (CLI demo)
```

## Monorepo Layout

```
forge-api-platform/
├── apps/
│   ├── api/            # Fastify REST API (data plane)
│   ├── dashboard/      # Next.js control plane
│   └── todo-demo/      # CLI demo consuming the SDK
├── packages/
│   ├── shared/         # Zod schemas, types, plan/quota logic, key format, scopes
│   ├── db/             # Prisma client + schema (PostgreSQL)
│   ├── auth/           # Ownership checks, soft-delete helpers
│   ├── sdk/            # Typed zero-dependency fetch client
│   └── config/         # Shared tsconfig
├── tests/              # Cross-package unit tests
├── docs/               # This documentation
└── docker-compose.yml  # PostgreSQL + Redis
```

## Request Flow

1. Client sends `Authorization: Bearer forge_live_xxx` to the API.
2. **request-id middleware** generates/accepts a request ID.
3. **auth middleware** extracts the bearer token, validates format, hashes it (SHA-256 + pepper), and looks up the key in PostgreSQL.
4. **scope middleware** (per-route) checks the key's granted scopes against the required scope.
5. **quota middleware** increments a Redis counter for the current UTC window and rejects with 429 if over limit.
6. **route handler** performs the CRUD operation.
7. **request-logger** writes a RequestLog row (method, path, status, latency, request ID) asynchronously.

## Key Design Decisions

- **API keys are never stored raw** — only a SHA-256 hash with a pepper. The visible prefix (first 16 chars) is stored for lookup/display.
- **Quota is enforced in Redis** using `INCR` + `EXPIRE` per UTC window. This is atomic and avoids race conditions.
- **Fail-open vs fail-closed** — when Redis is unavailable, `QUOTA_FAIL_MODE=open` allows requests through (availability over strictness), while `closed` rejects them.
- **Idempotency** — POST/PUT/PATCH accept an `Idempotency-Key` header. The side effect and response record commit in one transaction, so concurrent first requests cannot create duplicate todos. A different body with the same key returns 409.
- **Key rotation** — rotating a key creates a new key and gives the old one a 7-day grace period so active clients aren't broken.
- **Cursor pagination** — list endpoints use cursor-based pagination (createdAt desc) for consistent results during writes.

## Tech Stack

| Layer       | Technology                                |
| ----------- | ----------------------------------------- |
| API         | Fastify 5 (Node.js)                       |
| Dashboard   | Next.js 15 (App Router)                   |
| Auth        | NextAuth (Google OAuth + dev credentials) |
| Database    | PostgreSQL 16 + Prisma 6                  |
| Cache/Quota | Redis 7 (ioredis)                         |
| Validation  | Zod 3                                     |
| SDK         | Zero-dependency fetch client              |
| Tests       | Vitest                                    |
| Monorepo    | pnpm + Turborepo                          |
