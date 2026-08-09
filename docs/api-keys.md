# API Key Management

## Key Format

API keys use a structured format with an environment prefix and a 48-character hex secret:

```
forge_test_<48 hex chars>    # Test environment
forge_live_<48 hex chars>    # Live environment
```

Key components:

- **Environment prefix** (`forge_test_` / `forge_live_`) — determines which environment the key belongs to.
- **Secret** (24 bytes = 48 hex chars) — cryptographically random.
- **Visible prefix** (first 16 chars including env prefix) — stored for lookup and display.

## Storage & Security

The raw key is **never stored**. Only a SHA-256 hash is persisted:

```
keyHash = sha256(API_KEY_HASH_PEPPER + rawKey)
```

The `API_KEY_HASH_PEPPER` is a server-side secret that prevents rainbow-table attacks even if the database is compromised.

## Lifecycle

### Create

1. User creates a key via the dashboard (or platform API).
2. A raw key is generated with `randomBytes(24)`.
3. The key is stored as `sha256(pepper + raw)` plus the visible prefix.
4. The raw key is shown **exactly once** and never retrievable again.

### Verify

1. Incoming request includes `Authorization: Bearer forge_live_...`.
2. The API hashes the raw key and looks it up by hash.
3. Checks:
   - Key exists
   - Not revoked (allows grace period for rotated keys)
   - Not expired
4. `lastUsedAt` is updated asynchronously.

### Revoke

Immediately invalidates a key. All further requests with that key return `403 forbidden`.

### Rotate

Creates a new key with the same name, environment, and scopes. The old key gets a **7-day grace period** (`graceEndsAt`) during which it continues to work, so active clients aren't broken. After the grace period, the old key is effectively revoked.

### Expire

Keys can have an optional `expiresAt`. After expiration, requests return `403 key_expired`.

## Scopes

Each key grants a set of scopes:

| Scope         | Description                  |
| ------------- | ---------------------------- |
| `todos:read`  | List and get todos           |
| `todos:write` | Create, update, delete todos |

Scope checks are enforced per-route by the `requireScope` middleware.

## API Key Database Schema

```prisma
model ApiKey {
  id            String    @id @default(cuid())
  projectId     String
  name          String
  environment   KeyEnv    // TEST | LIVE
  keyPrefix     String    // visible prefix for lookup/display
  keyHash       String    // sha256(pepper + raw)
  scopes        String[]
  expiresAt     DateTime?
  revokedAt     DateTime?
  lastUsedAt    DateTime?
  createdAt     DateTime  @default(now())
  rotatedFromId String?   // links rotated key to original
  graceEndsAt   DateTime? // grace period for rotated keys
}
```

## Edge Cases

- **Key leakage** — rotate immediately. The leaked key works for 7 more days (grace), giving clients time to switch.
- **Deleted users** — `softDeleteUser` in `@forge/auth` revokes all active keys of the user's projects in a transaction.
- **Race conditions** — key verification and `lastUsedAt` updates are non-blocking; the fire-and-forget update never blocks the request.
