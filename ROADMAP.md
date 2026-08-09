# ForgeAPI Roadmap

This roadmap is organized by product outcome rather than dates. Priorities may change as developers use the project and report where the foundation is most valuable.

## Now: make the reference implementation easy to trust

- Keep the Todo API as a small, complete example of authentication, quotas, pagination, errors, and idempotency.
- Add an OpenAPI contract and a versioning policy for the public API.
- Add integration tests that exercise real PostgreSQL and Redis services.
- Keep the quickstart, use cases, threat model, and production-readiness guidance synchronized.
- Demonstrate failure behavior for revoked keys, quota exhaustion, Redis outage, retries, and duplicate writes.

## Next: remove adoption blockers

- Add a second representative resource to prove the platform boundary is reusable.
- Add administrative audit events for project, key, scope, and ownership changes.
- Add IP or actor-level abuse controls alongside project quotas.
- Expand usage reporting with durable aggregation and exportable records.
- Publish the TypeScript SDK with release automation, provenance, and compatibility guidance.
- Add a generated API reference from the versioned contract.

## Later: support larger product shapes

- Add resource-level policy composition and richer roles.
- Add webhook or event-delivery primitives with retry and signing semantics.
- Provide deployment blueprints for managed PostgreSQL, Redis, and observability systems.
- Evaluate billing and entitlement adapters only after usage semantics are stable.
- Consider additional SDK languages only when a real consumer need is demonstrated.

## What is deliberately not promised

ForgeAPI does not currently promise hosted availability, multi-region operations, billing, compliance certification, or a complete gateway/plugin ecosystem. Those are separate product and infrastructure commitments, not README features.

## How to influence the roadmap

Open an issue with:

1. The team or user problem.
2. The current workaround.
3. The smallest useful behavior.
4. The security, quota, data, and operational implications.
