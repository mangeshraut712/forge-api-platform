# ForgeAPI Use Cases

ForgeAPI is a self-hosted foundation for teams that want a consistent API boundary around application data or automation. The current Todo resource is intentionally small; the platform concerns are the reusable part.

## At a glance

| Use case                     | What ForgeAPI helps with today                                                                  | Add before production                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Internal service APIs        | Project isolation, scoped keys, quotas, request IDs, and a typed client                         | Service identity, SSO policy, internal audit requirements, and operational ownership                      |
| Partner and integration APIs | Separate credentials, key rotation with a grace period, idempotent writes, and request activity | Partner onboarding, per-partner abuse controls, contract versioning, and support workflows                |
| Multi-tenant SaaS APIs       | A project boundary for each tenant, per-project quotas, and ownership checks                    | Tenant lifecycle automation, billing-grade usage, audit events, data retention, and stronger tenant roles |
| AI and tool backends         | Typed SDK calls, retry-safe writes, scoped credentials, and quota controls                      | Prompt/data redaction, provider-specific limits, tracing, abuse detection, and workload isolation         |

## 1. Internal service APIs

### Problem

Several internal services need to call a shared API, but the team does not want credentials, authorization, retry behavior, and quota rules implemented differently in every client.

### ForgeAPI contribution

- Create a project for the internal API.
- Issue keys with only the scopes each service needs.
- Use the SDK for typed calls and consistent API errors.
- Use request IDs and logs to investigate failed calls.
- Apply per-project limits without adding quota code to each service.

### Production additions

Use an identity system appropriate for the organization, decide whether service-to-service credentials should be short-lived, and connect logs and metrics to the existing incident workflow.

## 2. Partner and integration APIs

### Problem

Partners need controlled access to selected operations, and credentials must be rotated without unexpectedly breaking an integration.

### ForgeAPI contribution

- Give each partner a separate project or key boundary.
- Grant only the scopes required by that integration.
- Rotate keys while allowing the old key to work during the configured grace period.
- Use idempotency keys for writes that partners may retry.
- Inspect request activity by project and request ID.

### Production additions

Add partner onboarding and offboarding workflows, an API contract/versioning policy, per-partner abuse controls, support ownership, and an audit trail for credential changes.

## 3. Multi-tenant SaaS APIs

### Problem

Each customer needs isolated access and predictable usage limits, while the product team needs a central place to manage credentials and quotas.

### ForgeAPI contribution

- Represent a tenant boundary with a project.
- Scope every API key and Todo query to that project.
- Resolve plan limits into daily or monthly Redis-backed quotas.
- Keep retry-safe writes from creating duplicate records.
- Expose usage and request activity through the control plane.

### Production additions

Add tenant lifecycle automation, billing-grade usage records, retention policies, administrator roles, audit events, and a load-tested data isolation strategy for every new resource.

## 4. AI and tool backends

### Problem

AI applications and tool servers often need a narrow, authenticated API surface with quotas and safe retries around side effects.

### ForgeAPI contribution

- Issue a key per tool, workspace, or integration.
- Use scopes to separate read and write operations.
- Use idempotency keys for tool calls that create or update state.
- Apply quotas to protect shared infrastructure.
- Use the typed SDK to keep consumer code predictable.

### Production additions

Add provider-specific cost limits, prompt and payload redaction, distributed tracing, abuse detection, data residency decisions, and stronger workload isolation.

## Capability map

| Capability          | User value                              | Current evidence                                                | Production caveat                                           |
| ------------------- | --------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| Project-scoped keys | Isolate callers and data boundaries     | Key records and project filters in the API                      | Define lifecycle automation and secret-storage policy       |
| Scopes              | Limit what each credential can do       | <code>todos:read</code> and <code>todos:write</code> middleware | Expand scopes consistently as resources grow                |
| Rotation            | Reduce the impact of leaked credentials | Dashboard rotation with grace-period support                    | Add audit events and operational notifications              |
| Quotas              | Protect shared capacity                 | Redis counters with plan windows and rate-limit headers         | Add high-availability Redis and abuse controls              |
| Idempotency         | Make retries safe                       | Transactional records for Todo writes                           | Define retention, replay size, and cross-resource semantics |
| Request context     | Debug failures across boundaries        | Request IDs, errors, and request logs                           | Add metrics, traces, redaction, and alerting                |
| Typed SDK           | Lower integration friction              | Zero-dependency TypeScript client                               | Publish releases and maintain compatibility guarantees      |
| Dashboard           | Give operators a control plane          | Projects, keys, usage, and request activity                     | Add production authentication, roles, and audit history     |

## Recommended adoption path

1. Run the Todo example locally and verify the authenticated API flow.
2. Replace the Todo model with one resource from your own domain.
3. Define the scopes, key lifecycle, and quota policy for that resource.
4. Connect managed PostgreSQL and Redis with backups, monitoring, and controlled migrations.
5. Add an API contract, integration tests, metrics, traces, and abuse controls.
6. Load-test the data plane and exercise key rotation, retries, failures, and recovery.
7. Deploy behind your chosen edge, identity, and observability systems.

ForgeAPI is most useful as the foundation for steps 2–5. It does not remove the product and operational decisions required by steps 6–7.

## When to choose something else

Choose a hosted API-management product or an established gateway when you need a managed control plane, multi-region availability, billing, a mature developer portal, or a broad protocol/plugin ecosystem on day one.
