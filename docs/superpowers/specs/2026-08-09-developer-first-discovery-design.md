# Developer-First Discovery Design

## Goal

Make ForgeAPI useful and understandable to developers discovering it in 2026, while preserving its value as an engineering portfolio project.

## Primary audience

Developers and small teams who need a self-hosted foundation for API keys, scopes, quotas, idempotent writes, request tracing, and a typed client.

## Product promise

ForgeAPI helps a team ship a reliable developer API without assembling API-key lifecycle management, quota enforcement, retry-safe writes, and a control-plane dashboard from scratch.

## Visitor journey

1. A visitor understands the problem and intended audience from the repository title, description, and first README section.
2. A visitor sees concrete use cases and knows whether the project fits their situation.
3. A visitor starts PostgreSQL and Redis, seeds a project, and makes an authenticated request in one focused quickstart.
4. A visitor can inspect the architecture, security model, API contract, and extension points.
5. A visitor understands which parts are demonstrated, which parts need production work, and what is planned next.

## Repository changes

- Rewrite the README around outcomes, use cases, quickstart, capability evidence, and honest limitations.
- Add business-oriented use cases for internal, partner, multi-tenant, and AI/tool APIs.
- Add a production-readiness matrix that separates implemented controls from deployment work.
- Add a focused roadmap that turns the current Todo example into a credible platform path.
- Align GitHub description and topics with the problem ForgeAPI solves.
- Keep the current runtime architecture and dependencies unchanged.

## Non-goals

- Do not claim ForgeAPI is a hosted service or production SaaS.
- Do not add speculative billing, analytics, or provider integrations.
- Do not replace the Todo resource before it has served as a stable platform example.
- Do not introduce a second documentation system or a generated API portal in this pass.

## Acceptance criteria

- A new visitor can identify the target user, core problem, and current limitations without reading source code.
- The quickstart leads to a working authenticated API request.
- Use cases map directly to existing capabilities and do not overclaim.
- Production risks and missing capabilities are visible before adoption.
- README, docs, GitHub metadata, formatting, typechecking, build, tests, and audit remain green.
