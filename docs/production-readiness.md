# Production Readiness

ForgeAPI is a reference implementation, not a hosted production service. This page separates controls demonstrated in the repository from the work an adopting team still owns.

## Implemented in this repository

| Area                | Evidence                                                                                                          |
| ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| API-key protection  | Raw keys are shown once; hashes use a server-side pepper; test/live formats are validated                         |
| Authorization       | Keys are project-scoped and routes require explicit scopes                                                        |
| Project isolation   | Todo reads and writes are filtered by project; dashboard actions check ownership                                  |
| Key lifecycle       | Create, revoke, expire, and rotate operations are represented                                                     |
| Quotas              | Redis-backed daily/monthly plan windows and rate-limit headers                                                    |
| Retry safety        | POST, PUT, and PATCH Todo writes support transactional idempotency                                                |
| Request context     | Request IDs are generated or accepted, returned in errors, and stored with request logs                           |
| Input limits        | Zod schemas are strict and the API has a request body limit                                                       |
| Health signals      | Liveness and PostgreSQL/Redis readiness endpoints are available                                                   |
| Delivery checks     | GitHub Actions runs install, Prisma generation, formatting, typechecking, build, and tests                        |
| Repository security | Secret scanning, push protection, protected main, and SHA-pinned actions are enabled. Dependabot version and security updates are disabled; dependency bumps are applied manually |

## Required before production

| Area             | Decision or implementation work                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------- |
| Identity         | Replace development login behavior with your organization’s production identity and access policy                     |
| Secrets          | Use a secret manager, rotate secrets, and keep <code>AUTH_SECRET</code> and <code>API_KEY_HASH_PEPPER</code> separate |
| Data             | Use managed PostgreSQL, encrypted backups, restore drills, migrations, retention, and a disaster-recovery target      |
| Cache and quotas | Use highly available Redis, decide fail-open versus fail-closed per workload, and load-test quota behavior            |
| Abuse controls   | Add IP or actor-level controls, route-specific limits, payload cost controls, and alerting for anomalous usage        |
| Observability    | Add structured log redaction, metrics, traces, dashboards, alerts, and correlation with upstream services             |
| Auditability     | Record credential changes, ownership changes, access-policy changes, and administrative actions                       |
| API contract     | Publish and version an OpenAPI contract before onboarding external consumers                                          |
| SDK lifecycle    | Define release automation, compatibility guarantees, deprecation policy, and package provenance                       |
| Deployment       | Add environment-specific configuration, migrations, rollbacks, probes, autoscaling, and a tested deployment path      |
| Data model       | Review every new resource for tenant isolation, authorization, pagination, retention, and index coverage              |
| Compliance       | Evaluate privacy, data residency, retention, and industry requirements for the data being served                      |

## Go/no-go checklist

Before exposing an API to external customers, answer “yes” to each item:

- [ ] Production identity and authorization policy are configured.
- [ ] Secrets are stored and rotated outside the repository.
- [ ] PostgreSQL backups and restore procedures have been tested.
- [ ] Redis failure behavior matches the business and billing risk.
- [ ] Rate limits, abuse controls, and alerts have been load-tested.
- [ ] API contracts and SDK compatibility are versioned.
- [ ] Audit events exist for key and access-policy changes.
- [ ] Logs, metrics, traces, and sensitive-data redaction are verified.
- [ ] Deployment, rollback, migration, and incident procedures are documented.
- [ ] Tenant isolation has tests for every externally reachable resource.

## Operational questions for adopters

- Which party owns a project: a user, workspace, service, or partner?
- Which requests are billable, and which record is the source of truth for usage?
- How quickly must a revoked key stop working?
- What happens to writes when PostgreSQL or Redis is unavailable?
- How long should idempotency responses and request logs be retained?
- Which data may appear in logs, traces, error messages, and support tools?
- Who can create, rotate, revoke, or inspect credentials?

The repository gives you working primitives for these questions, but the correct answers depend on the product and risk model of the adopting team.
