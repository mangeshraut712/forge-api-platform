# Request Quota System

## Plans & Limits

| Plan      | Limit        | Window       | Description                   |
| --------- | ------------ | ------------ | ----------------------------- |
| FREE      | 100          | day          | Default plan for new projects |
| DEVELOPER | 10,000       | month        | Higher volume tier            |
| CUSTOM    | configurable | day or month | Custom daily/monthly limits   |

Custom plans resolve as follows:

1. If `customDailyLimit` is set (> 0), use daily window.
2. Else if `customMonthlyLimit` is set (> 0), use monthly window.
3. Else fall back to FREE plan (safe default for misconfiguration).

## Implementation

Quota enforcement uses **Redis atomic INCR + EXPIRE**:

```typescript
async function checkQuota(projectId: string, project: Project) {
  const quota = resolvePlanQuota(project);
  const windowId = quotaWindowId(quota.window); // "2026-03-24" or "2026-03"
  const ttl = quotaWindowTtlSeconds(quota.window); // seconds until window end
  const key = `quota:${projectId}:${quota.window}:${windowId}`;

  const count = await redis.incr(key); // atomic
  if (count === 1) await redis.expire(key, ttl); // set TTL on first request
  return {
    allowed: count <= quota.limit,
    remaining: Math.max(0, quota.limit - count),
    limit: quota.limit,
    window: quota.window,
    resetUnix: quotaWindowResetUnix(quota.window),
  };
}
```

This approach is:

- **Atomic** — Redis `INCR` is a single operation, no race conditions on concurrent requests.
- **Self-cleaning** — TTL expires the counter at the end of the UTC window.
- **Efficient** — O(1) per request, no database writes for quota.

## Response Headers

Every API response includes standard rate-limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 73
X-RateLimit-Reset: 1785902400    # Unix seconds when window resets
```

## Error Response

When the limit is exceeded:

```json
{
  "error": {
    "code": "quota_exceeded",
    "message": "Quota exceeded. Resets at 2026-03-25T00:00:00.000Z",
    "request_id": "uuid-here"
  }
}
```

HTTP Status: `429 Too Many Requests`

## Fail-Open vs Fail-Closed

When Redis is unavailable, the behavior is controlled by `QUOTA_FAIL_MODE`:

| Mode             | Behavior                                                           |
| ---------------- | ------------------------------------------------------------------ |
| `open` (default) | Allow requests through (availability over strictness)              |
| `closed`         | Reject with 429 `quota_unavailable` (strictness over availability) |

**Design decision**: We default to fail-open because the platform's primary value is API availability. A brief quota-check outage shouldn't take down all consumer apps. In strictly-billed scenarios (e.g., paid plans), set `QUOTA_FAIL_MODE=closed`.

## Concurrent Quota Updates

Redis `INCR` guarantees exactly-once incrementation even under high concurrency. The TTL is only set when the counter transitions from 0 to 1, avoiding redundant `EXPIRE` calls.

## Monitoring

Quota usage is visible in the dashboard's Usage page:

- Total requests
- Success rate
- 429 responses
- p50/p95 latency
- Active API keys
- Recent request log (method, path, status, latency)
