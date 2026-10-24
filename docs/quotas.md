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

Quota enforcement increments the counter and sets its TTL in one Redis script:

```lua
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) < 0 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
end
return count
```

The key is `quota:{projectId}:{window}:{windowId}` (for example `quota:proj_1:day:2026-03-24`). A separate `INCR` followed by `EXPIRE` can leave a counter with no TTL if the process stops between the two commands. The script also repairs a key whose TTL was lost.

This approach is:

- **Atomic** — the increment and expiry happen in one script, so concurrent requests cannot race the TTL.
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

| Mode             | Behavior                                                                |
| ---------------- | ----------------------------------------------------------------------- |
| `open` (default) | Allow requests through (availability over strictness)                   |
| `closed`         | Reject with HTTP 503 `quota_unavailable` (strictness over availability) |

**Design decision**: We default to fail-open because the platform's primary value is API availability. A brief quota-check outage shouldn't take down all consumer apps. In strictly-billed scenarios (e.g., paid plans), set `QUOTA_FAIL_MODE=closed`.

## Concurrent Quota Updates

Redis `INCR` guarantees exactly-once incrementation even under high concurrency. The script sets a TTL whenever the key has none, including the first request in the window.

## Monitoring

Quota usage is visible in the dashboard's Usage page:

- Total requests
- Success rate
- 429 responses (HTTP status 429, including quota denials)
- p50/p95 latency
- Active API keys
- Recent request log (method, path, status, latency)
