# Threat Model

## Overview

This document describes the security threats considered in ForgeAPI's design, the mitigations implemented, and the residual risks. It covers the control plane (dashboard), the data plane (REST API), and the SDK.

## Assets

| Asset          | Description                               | Sensitivity |
| -------------- | ----------------------------------------- | ----------- |
| API keys       | Raw keys grant access to a project's data | High        |
| User accounts  | Google OAuth identity, email              | High        |
| Project data   | Todos and other resources                 | Medium      |
| Request logs   | Method, path, status, latency, request ID | Low-Medium  |
| Quota counters | Redis counters per project/window         | Low         |

## Threats & Mitigations

### 1. API Key Leakage

**Threat**: A raw API key is exposed in logs, client code, or a public repo.

**Mitigations**:

- Keys are never stored raw — only `sha256(pepper + raw)` is persisted.
- Keys are shown exactly once at creation; never retrievable again.
- Visible prefix (first 16 chars) is used for display/lookup, not the full key.
- `API_KEY_HASH_PEPPER` is a server-side secret preventing rainbow-table attacks.
- **Rotation** — if a key leaks, rotate it. The old key gets a 7-day grace period so clients can migrate without breakage.

**Residual risk**: A leaked key remains valid until revoked/rotated. Mitigate by monitoring `lastUsedAt` and rotating on suspicion.

### 2. Key Revocation Bypass

**Threat**: A revoked key continues to work.

**Mitigations**:

- `verifyApiKey` checks `revokedAt` on every request.
- Rotated keys get a **grace period** (`graceEndsAt`) — after it expires, the key is effectively revoked.
- `softDeleteUser` revokes all active keys of a user's projects in a transaction.

### 3. Quota Bypass / Abuse

**Threat**: A client exceeds their quota or bypasses rate limiting.

**Mitigations**:

- Quota enforced via Redis `INCR` (atomic, no race conditions).
- Per-project, per-window counters with TTL.
- `X-RateLimit-*` headers expose remaining quota to clients.
- 429 responses with `quota_exceeded` code.
- **Fail-open vs fail-closed** — `QUOTA_FAIL_MODE` controls behavior when Redis is down.

**Residual risk**: Fail-open mode allows requests through during Redis outages. In strictly-billed scenarios, set `QUOTA_FAIL_MODE=closed`.

### 4. Unauthorized Access (Missing/Weak Auth)

**Threat**: An attacker accesses another project's data.

**Mitigations**:

- Every `/v1/*` request requires a valid Bearer token.
- Keys are scoped to a project — `verifyApiKey` returns the project context.
- All todo queries filter by `projectId` (never by key alone).
- Dashboard ownership checks via `assertProjectOwner` on every page/action.

### 5. Scope Escalation

**Threat**: A key with `todos:read` performs a write operation.

**Mitigations**:

- `requireScope` middleware enforces per-route scope requirements.
- Write routes require `todos:write`; read routes require `todos:read`.
- Scopes are stored on the key and checked on every request.

### 6. Idempotency Key Reuse

**Threat**: An attacker replays a request with a different body using the same idempotency key.

**Mitigations**:

- `getIdempotencyRecord` compares the request hash.
- A different body with the same key returns `409 conflict`.
- Idempotency records are scoped per project.

### 7. Redis Unavailability

**Threat**: Redis goes down, breaking quota enforcement.

**Mitigations**:

- `QUOTA_FAIL_MODE=open` (default) — allow requests through (availability).
- `QUOTA_FAIL_MODE=closed` — reject with 429 `quota_unavailable`.
- Redis client has `maxRetriesPerRequest: 2` and error logging.

### 8. Database Transaction Failures

**Threat**: A partial write leaves the system in an inconsistent state.

**Mitigations**:

- Key rotation uses `prisma.$transaction` — both the old-key update and new-key create are atomic.
- `softDeleteUser` uses a transaction to revoke keys and delete sessions atomically.

### 9. Google OAuth Session Expiration

**Threat**: A user's session expires but they still have access.

**Mitigations**:

- NextAuth JWT sessions with `AUTH_SECRET`.
- `getServerSession` on every dashboard page/action.
- Unauthenticated users are redirected to `/login`.

### 10. Deleted Users with Active Keys

**Threat**: A deleted user's API keys continue to work.

**Mitigations**:

- `softDeleteUser` revokes all active keys of the user's projects in a transaction.
- Keys are checked for `revokedAt` on every request.

### 11. CORS Abuse

**Threat**: A malicious website makes authenticated requests to the API.

**Mitigations**:

- CORS restricted to `CORS_ORIGINS` env var (defaults to localhost:3000/3001).
- Only `Authorization`, `Content-Type`, `Idempotency-Key`, `X-Request-Id` headers allowed.
- `X-RateLimit-*` headers exposed for client-side quota display.

### 12. SDK Version Compatibility

**Threat**: A consumer uses an old SDK against a newer API (or vice versa).

**Mitigations**:

- SDK and API share types from `@forge/shared` (single source of truth).
- Semantic versioning on the SDK package.
- `ForgeApiError` carries the error `code` so consumers can handle version-specific behavior.

## Residual Risks & Future Work

| Risk                     | Description                                     | Mitigation                                      |
| ------------------------ | ----------------------------------------------- | ----------------------------------------------- |
| Brute-force key guessing | 48 hex chars = 192 bits of entropy — infeasible | None needed                                     |
| Rate limiting per IP     | Currently only per-project quota, not per-IP    | Add IP-based rate limiting                      |
| Audit logging            | Request logs exist but no admin audit trail     | Add admin audit log                             |
| Key expiry enforcement   | Expired keys return 403 but no auto-cleanup     | Add scheduled job to purge expired keys         |
| SDK retry on 429         | SDK retries GET on 429 but not POST             | Document idempotency-key usage for POST retries |
