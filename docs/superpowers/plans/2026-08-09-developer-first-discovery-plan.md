# Developer-First Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (<code>- [ ]</code>) syntax for tracking.

**Goal:** Make ForgeAPI easier for developers and small teams to evaluate, run, and extend while keeping its production boundaries explicit.

**Architecture:** Keep the existing Fastify, Next.js, PostgreSQL, Redis, Prisma, SDK, and Turborepo architecture unchanged. Improve the public product surface through a benefit-led README, focused use-case and production-readiness documents, a practical roadmap, and a simpler demo command.

**Tech Stack:** Markdown, YAML, pnpm scripts, GitHub repository metadata, existing TypeScript monorepo.

## Global Constraints

- Primary audience: developers and small teams evaluating a self-hosted API-platform foundation.
- Secondary audience: recruiters and engineering reviewers.
- Do not claim ForgeAPI is a hosted service or production SaaS.
- Do not add speculative billing, analytics, provider integrations, or runtime architecture changes.
- Use existing capabilities as evidence and label missing production work explicitly.
- Preserve the existing Node.js 22, pnpm, Turborepo, Fastify, Next.js, PostgreSQL, Redis, Prisma, and SDK stack.

---

### Task 1: Make the root README outcome-led

**Files:**

- Modify: <code>README.md</code>

**Interfaces:**

- Consumes: Existing API endpoints, quickstart commands, architecture, security controls, and SDK examples.
- Produces: A visitor-facing entry point that explains the audience, problem, use cases, current capabilities, limitations, and next steps before deep implementation detail.

- [x] **Step 1: Add a clear product promise and audience section**

Place the promise directly below the title and CI badge:

```markdown
ForgeAPI is a self-hosted API-platform starter for teams that need secure API keys, scoped access, quotas, idempotent writes, request tracing, and a typed client without assembling those primitives from scratch.

**Best for:** platform engineers, backend developers, and small teams building internal, partner, multi-tenant, or AI/tool APIs.
```

- [x] **Step 2: Add a decision guide**

Add <code>Good fit</code>, <code>Not a fit yet</code>, and <code>Choose your path</code> sections that distinguish the current reference implementation from a hosted SaaS product.

- [x] **Step 3: Add use-case and readiness links**

Link to <code>docs/use-cases.md</code>, <code>docs/production-readiness.md</code>, and <code>ROADMAP.md</code> near the top of the README.

- [x] **Step 4: Reorganize the existing sections**

Keep the existing technical facts, but put them after the visitor understands the problem, audience, use cases, current capabilities, and five-minute quickstart.

- [x] **Step 5: Verify the documentation**

Run:

```bash
pnpm lint
```

Expected: Prettier reports that all matched files use the project style.

### Task 2: Document business use cases

**Files:**

- Create: <code>docs/use-cases.md</code>
- Modify: <code>README.md</code>

**Interfaces:**

- Consumes: Existing key lifecycle, scope, quota, request-log, idempotency, dashboard, and SDK behavior.
- Produces: Honest mappings from real team problems to existing ForgeAPI capabilities and explicit adoption gaps.

- [x] **Step 1: Write the four supported use cases**

Document:

1. Internal service APIs.
2. Partner and integration APIs.
3. Multi-tenant SaaS APIs.
4. AI and tool backends.

For each, include the problem, the ForgeAPI capabilities that help, and what still needs to be added before production.

- [x] **Step 2: Add a capability map**

Use a table mapping capability, user value, current evidence, and production caveat.

- [x] **Step 3: Add an adoption path**

Describe the recommended path: run the Todo example, replace the resource, configure authentication, connect managed infrastructure, add observability, then load-test and deploy.

- [x] **Step 4: Link the document from the README**

Use a prominent “Use cases” link in the first half of the README.

### Task 3: Add production-readiness boundaries

**Files:**

- Create: <code>docs/production-readiness.md</code>
- Modify: <code>README.md</code>

**Interfaces:**

- Consumes: Existing threat model, security policy, CI gates, environment variables, and infrastructure assumptions.
- Produces: A decision matrix that prevents visitors from mistaking a strong reference implementation for a ready-made hosted production service.

- [x] **Step 1: Separate implemented controls from deployment work**

Create sections for <code>Implemented in this repository</code>, <code>Required before production</code>, and <code>Operational questions</code>.

- [x] **Step 2: Include concrete controls**

Cover API-key hashing, scopes, project isolation, quota behavior, idempotency transactions, readiness checks, request IDs, body limits, CI, secret scanning, dependency audit, managed infrastructure, backups, observability, audit logs, IP abuse controls, OAuth configuration, migrations, load testing, and SDK release management.

- [x] **Step 3: Add a go/no-go checklist**

Give adopters a short checklist they can use before exposing the API to external customers.

- [x] **Step 4: Link the document from the README**

Place the link beside the project-status and security sections.

### Task 4: Add a focused roadmap and a demo shortcut

**Files:**

- Create: <code>ROADMAP.md</code>
- Modify: <code>package.json</code>
- Modify: <code>README.md</code>

**Interfaces:**

- Consumes: Current Todo reference implementation and documented residual risks.
- Produces: A credible sequence of product milestones and a simple command for running the end-to-end demo.

- [x] **Step 1: Define roadmap horizons**

Use <code>Now</code>, <code>Next</code>, and <code>Later</code> sections. Keep items outcome-oriented and avoid promising dates.

- [x] **Step 2: Prioritize adoption blockers**

Prioritize an OpenAPI contract, integration tests with PostgreSQL and Redis, audit events, IP abuse controls, SDK publishing, richer usage reporting, and a second representative resource before billing or hosted-service work.

- [x] **Step 3: Add a root demo command**

Add this script to the root package manifest:

```json
{
  "demo": "pnpm --filter @forge/todo-demo dev"
}
```

- [x] **Step 4: Update the README**

Use <code>pnpm demo</code> in the demo section and link the roadmap near the top.

### Task 5: Align GitHub discovery metadata

**Files:**

- Remote: <code>mangeshraut712/forge-api-platform</code>

**Interfaces:**

- Consumes: The final product promise and use-case language.
- Produces: GitHub description and topics that match how developers search for API-platform foundations.

- [x] **Step 1: Set the repository description**

Use:

```text
Self-hosted API platform starter for scoped keys, quotas, idempotent REST APIs, and a typed TypeScript SDK.
```

- [x] **Step 2: Use problem-oriented topics**

Keep relevant technology topics and add product topics such as <code>api-management</code>, <code>developer-portal</code>, <code>self-hosted</code>, <code>saas-infrastructure</code>, and <code>open-source</code>.

### Task 6: Verify and publish

**Files:**

- Verify: <code>README.md</code>, <code>docs/use-cases.md</code>, <code>docs/production-readiness.md</code>, <code>ROADMAP.md</code>, <code>package.json</code>
- Verify: <code>.github/workflows/ci.yml</code>

- [x] **Step 1: Run documentation and code checks**

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
pnpm audit --prod
```

- [x] **Step 2: Inspect the final diff**

```bash
git diff --check
git status --short --branch
```

Expected: no whitespace errors and only intended files changed.

- [x] **Step 3: Commit the implementation**

```bash
git add README.md ROADMAP.md docs/use-cases.md docs/production-readiness.md package.json
git commit -m "docs: make ForgeAPI easier to adopt"
```

- [x] **Step 4: Push and verify CI**

```bash
git push origin main
gh run list --repo mangeshraut712/forge-api-platform --workflow ci.yml --limit 1
```

Expected: the pushed commit is on <code>origin/main</code> and the CI run succeeds.
