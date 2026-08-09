# ForgeAPI Platform

[![CI](https://github.com/mangeshraut712/forge-api-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/mangeshraut712/forge-api-platform/actions/workflows/ci.yml)

A self-hosted API-platform starter for teams that need secure API keys, scoped access, quotas, idempotent writes, request tracing, and a typed client without assembling those primitives from scratch.

ForgeAPI is built for platform engineers, backend developers, and small teams building internal, partner, multi-tenant, or AI/tool APIs. It is also a concrete reference project for understanding how these concerns fit together.

> Current status: Early-stage reference implementation. The Todo API is the example resource; ForgeAPI is not a hosted SaaS product.

## Why ForgeAPI

Most teams eventually need the same API foundation:

- Give each service, tenant, or partner its own credentials.
- Limit usage without scattering quota logic across application code.
- Make retries safe when networks fail or clients time out.
- Show developers how to authenticate, handle errors, and use a typed client.
- Keep enough request context to investigate failures.

ForgeAPI packages those concerns into one runnable control plane, data plane, database, quota store, and SDK so a team can start from a working boundary instead of a blank repository.

## Who should use it

ForgeAPI is a good starting point for:

- Internal APIs shared by multiple services or teams
- Partner and integration APIs with scoped credentials and rotation
- Multi-tenant SaaS APIs with per-project quotas
- AI and tool backends that need typed clients, retries, and idempotent writes

It is not the right choice yet if you need a hosted API gateway, billing-grade metering, a complete OpenAPI portal, multi-region operations, or a turnkey production deployment.

See [use cases](docs/use-cases.md), [production-readiness guidance](docs/production-readiness.md), and the [roadmap](ROADMAP.md) before adopting it for an external customer-facing API.

## Choose your path

| If you want to...                          | Start here                                                |
| ------------------------------------------ | --------------------------------------------------------- |
| Run a working API platform locally         | Follow the [5-minute quick start](#quick-start)           |
| See the SDK and retry/idempotency behavior | Run <code>pnpm demo</code>                                |
| Understand the system boundary             | Read [the architecture](docs/architecture.md)             |
| Decide whether it fits your product        | Read [the use cases](docs/use-cases.md)                   |
| Plan a real deployment                     | Read [production readiness](docs/production-readiness.md) |
| Contribute or extend the example           | Read [CONTRIBUTING.md](CONTRIBUTING.md)                   |

## Core capabilities

| Capability                | User value                                                     |
| ------------------------- | -------------------------------------------------------------- |
| Project-scoped API keys   | Give services and partners isolated credentials                |
| Scopes and key rotation   | Reduce blast radius and support safe credential changes        |
| Redis-backed quotas       | Apply plan limits consistently per project                     |
| Transactional idempotency | Make retryable writes safe during network failures             |
| Request IDs and logs      | Trace a request across client, API, and persistence            |
| Typed zero-dependency SDK | Give TypeScript consumers a fast, predictable integration path |
| Dashboard control plane   | Manage projects, keys, usage, and request activity             |

## Detailed features

- API key creation, revocation, expiration, and rotation
- Separate test and live API key environments
- SHA-256 API key hashing with a configurable server-side pepper
- Scoped Bearer-token authentication
- Project ownership and access control
- Redis-backed quota enforcement
- Daily and monthly quota windows
- Configurable quota fail-open and fail-closed behavior
- Cursor-based Todo API pagination
- Transaction-safe idempotency for write requests
- Consistent structured API errors with request IDs
- Request logging and rate-limit response headers
- Next.js dashboard for projects, keys, usage, and request activity
- Typed, zero-dependency TypeScript SDK
- PostgreSQL persistence through Prisma
- Docker Compose development infrastructure
- Turborepo-based monorepo workflows
- Automated formatting, typechecking, builds, tests, and dependency auditing

## Architecture

```mermaid
flowchart LR
    Consumer["Consumer application"] --> SDK["@mangeshraut/forge-sdk"]
    SDK --> API["Fastify REST API"]

    Dashboard["Next.js control plane"] --> PostgreSQL["PostgreSQL"]
    API --> PostgreSQL
    API --> Redis["Redis quota counters"]

    Dashboard --> Projects["Projects and API keys"]
    API --> Auth["Authentication and scopes"]
    API --> Quotas["Quota enforcement"]
    API --> Idempotency["Transactional idempotency"]
```

ForgeAPI is split into two logical planes:

- **Control plane:** The Next.js dashboard used to manage users, projects, API keys, usage, and request logs.
- **Data plane:** The Fastify REST API consumed by applications using generated API keys.

## Repository structure

```text
apps/
├── api/              Fastify REST API
├── dashboard/        Next.js control-plane dashboard
└── todo-demo/        CLI application exercising the SDK

packages/
├── auth/             Ownership and soft-delete helpers
├── config/           Shared TypeScript configuration
├── db/               Prisma client and PostgreSQL schema
├── sdk/              Typed ForgeAPI client
└── shared/           Schemas, types, plans, quotas, errors, and scopes

tests/                Cross-package SDK tests
docs/                 Architecture and design documentation
docker-compose.yml    PostgreSQL and Redis development services
```

## Technology stack

| Area            | Technology            |
| --------------- | --------------------- |
| Runtime         | Node.js 22            |
| Package manager | pnpm                  |
| Monorepo        | Turborepo             |
| API             | Fastify 5             |
| Dashboard       | Next.js 15 App Router |
| Authentication  | NextAuth              |
| Database        | PostgreSQL 16         |
| ORM             | Prisma 6              |
| Quotas          | Redis 7 and ioredis   |
| Validation      | Zod                   |
| SDK             | TypeScript and Fetch  |
| Testing         | Vitest                |
| CI              | GitHub Actions        |

## Quick start

### Prerequisites

- Node.js 22.x
- pnpm 9.x
- Docker and Docker Compose

The repository includes an <code>.nvmrc</code> file for the expected Node.js version.

### Install dependencies

```bash
git clone https://github.com/mangeshraut712/forge-api-platform.git
cd forge-api-platform

nvm install
nvm use
corepack enable
pnpm install
```

### Configure the environment

```bash
cp .env.example .env
```

The development environment uses:

- PostgreSQL on <code>localhost:5432</code>
- Redis on <code>localhost:6379</code>
- API on <code>localhost:4000</code>
- Dashboard on <code>localhost:3000</code>

### Start PostgreSQL and Redis

```bash
pnpm docker:up
```

### Initialize the database

```bash
pnpm db:generate
pnpm db:push
pnpm db:seed
```

The seed command creates a development user, a demo project, and a live API key. The raw API key is printed once in the terminal.

Copy that key into <code>.env</code>:

```env
FORGE_API_KEY=forge_live_your_key_here
```

### Start the applications

```bash
pnpm dev
```

Open the dashboard at:

```text
http://localhost:3000
```

The development credentials login accepts:

```text
dev@forge.local
```

No password is required when <code>AUTH_DEV_LOGIN=true</code>.

The API is available at:

```text
http://localhost:4000
```

Run applications individually when needed:

```bash
pnpm --filter @forge/api dev
pnpm --filter @forge/dashboard dev
pnpm demo
```

## API

### Public endpoints

| Method           | Endpoint             | Description                          |
| ---------------- | -------------------- | ------------------------------------ |
| <code>GET</code> | <code>/health</code> | Liveness check                       |
| <code>GET</code> | <code>/ready</code>  | PostgreSQL and Redis readiness check |

### Todo endpoints

All <code>/v1/*</code> endpoints require a valid Bearer token.

| Method              | Endpoint                   | Scope                    | Description                       |
| ------------------- | -------------------------- | ------------------------ | --------------------------------- |
| <code>GET</code>    | <code>/v1/todos</code>     | <code>todos:read</code>  | List todos with cursor pagination |
| <code>GET</code>    | <code>/v1/todos/:id</code> | <code>todos:read</code>  | Retrieve one todo                 |
| <code>POST</code>   | <code>/v1/todos</code>     | <code>todos:write</code> | Create a todo                     |
| <code>PUT</code>    | <code>/v1/todos/:id</code> | <code>todos:write</code> | Replace a todo                    |
| <code>PATCH</code>  | <code>/v1/todos/:id</code> | <code>todos:write</code> | Partially update a todo           |
| <code>DELETE</code> | <code>/v1/todos/:id</code> | <code>todos:write</code> | Delete a todo                     |

### Authentication

```http
Authorization: Bearer forge_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

API keys are only displayed in raw form once. The API stores a hash and a visible prefix rather than the original key.

### Create a todo

```bash
export FORGE_API_KEY="forge_live_your_key_here"

curl -X POST http://localhost:4000/v1/todos \
  -H "Authorization: Bearer $FORGE_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: todo-example-1" \
  -d '{"title":"Ship ForgeAPI"}'
```

### List todos

```bash
curl "http://localhost:4000/v1/todos?limit=20" \
  -H "Authorization: Bearer $FORGE_API_KEY"
```

### Idempotency

Write requests support the <code>Idempotency-Key</code> header.

Retrying a request with the same key and request body replays the original response. Reusing the same key with a different request body returns a conflict response.

Idempotent write operations:

- <code>POST /v1/todos</code>
- <code>PUT /v1/todos/:id</code>
- <code>PATCH /v1/todos/:id</code>

### Rate-limit headers

API responses include quota information:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: 1742956800
```

### Error format

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Invalid API key",
    "request_id": "request-id"
  }
}
```

## TypeScript SDK

The SDK is configured as <code>@mangeshraut/forge-sdk</code>.

```typescript
import { createForgeClient } from "@mangeshraut/forge-sdk";

const client = createForgeClient({
  apiKey: process.env.FORGE_API_KEY!,
  baseUrl: "http://localhost:4000",
});

const created = await client.createTodo({
  title: "Ship ForgeAPI",
});

const todos = await client.listTodos({
  limit: 20,
});

await client.updateTodo(created.id, {
  completed: true,
});

await client.deleteTodo(created.id);
```

The SDK also provides:

- Runtime API key format validation
- Typed Todo operations
- Typed API errors
- Request ID access
- Configurable request timeouts
- Retry handling for safe requests
- Idempotency-key support for writes

## Plans and quotas

| Plan                   |   Default limit | Window       |
| ---------------------- | --------------: | ------------ |
| <code>FREE</code>      |    100 requests | Day          |
| <code>DEVELOPER</code> | 10,000 requests | Month        |
| <code>CUSTOM</code>    |    Configurable | Day or month |

Quota counters are maintained in Redis using atomic increments and expiration windows.

When Redis is unavailable, behavior is controlled by:

```env
QUOTA_FAIL_MODE=open
```

Use <code>open</code> to prioritize availability or <code>closed</code> to prioritize strict quota enforcement.

## Development commands

```bash
pnpm dev                 # Start the API, dashboard, and demo
pnpm demo                # Run the end-to-end Todo SDK demo
pnpm build               # Build all packages and applications
pnpm test                # Run the test suite
pnpm typecheck           # Type-check the monorepo
pnpm lint                # Check formatting
pnpm format              # Format supported source files
pnpm db:generate         # Generate the Prisma client
pnpm db:push             # Apply the schema to the local database
pnpm db:migrate          # Create and apply a development migration
pnpm db:migrate:deploy   # Apply checked-in migrations to a deployment database
pnpm db:seed             # Seed local development data
pnpm docker:up           # Start PostgreSQL and Redis
pnpm docker:down         # Stop PostgreSQL and Redis
pnpm audit --prod        # Audit production dependencies
```

## Running the Todo demo

Make sure the API is running and <code>FORGE_API_KEY</code> is configured.

```bash
pnpm --filter @forge/todo-demo dev
```

The demo exercises:

- Todo listing, creation, updates, and deletion
- Idempotency replay
- Invalid and unknown API key handling
- Request timeouts
- Network retries
- Rate-limit headers

## Environment variables

Copy <code>.env.example</code> to <code>.env</code> for local development.

Important production values include:

- A long random <code>AUTH_SECRET</code>
- A separate <code>API_KEY_HASH_PEPPER</code> with at least 32 characters
- Production PostgreSQL and Redis URLs
- Explicit <code>CORS_ORIGINS</code>
- <code>QUOTA_FAIL_MODE</code> selected according to availability requirements
- Google OAuth credentials if Google login is enabled

Never commit <code>.env</code>, API keys, OAuth secrets, or database credentials.

For a deployment database, set <code>DATABASE_URL</code> in the deployment
environment and run <code>pnpm db:migrate:deploy</code>. The repository includes
an initial Prisma migration; use <code>pnpm db:push</code> only for local
schema prototyping.

## Security model

ForgeAPI applies several security controls:

- API keys are hashed before storage.
- API keys are validated for environment and format.
- API routes require explicit scopes.
- Project resources are ownership-scoped.
- Deleted users are prevented from authenticating.
- Request IDs are generated and returned with errors.
- Request bodies are size-limited.
- Idempotency records are committed with their write side effects.
- Production key hashing requires a strong pepper.
- Dependency vulnerabilities are checked in CI.

This repository is a reference implementation and should be threat-modeled and configured separately before production deployment.

## CI

GitHub Actions runs on pushes and pull requests targeting <code>main</code>.

The workflow performs:

1. Frozen dependency installation
2. Prisma client generation
3. Formatting checks
4. Typechecking
5. Builds
6. Tests

## Project status

The current implementation uses the Todo resource to demonstrate the platform lifecycle. The architecture is intended to support additional API resources, dashboard views, plans, and integrations over time. See the [roadmap](ROADMAP.md) and [production-readiness guide](docs/production-readiness.md) for the intended adoption path and current boundaries.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup, quality checks, and pull request guidance.

## Security reports

Please do not report security vulnerabilities in public issues. See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## License

MIT. See [LICENSE](LICENSE).
