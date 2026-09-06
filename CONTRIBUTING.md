# Contributing to ForgeAPI Platform

Thanks for contributing. ForgeAPI is an early-stage reference implementation, so focused changes and clear verification are especially helpful.

## Local setup

Use Node.js 22.x and pnpm 9.x. Start the local PostgreSQL and Redis services before running the API or dashboard.

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm docker:up
pnpm db:generate
pnpm db:push
pnpm db:seed
```

## Before opening a pull request

Run the same checks used by CI:

```bash
pnpm lint
pnpm typecheck
pnpm build
pnpm test
```

Dependabot is not enabled. Propose dependency bumps in ordinary pull requests rather than relying on automated update PRs.

For dependency changes, also run:

```bash
pnpm install --frozen-lockfile --offline
pnpm audit --prod
```

## Pull request guidance

- Keep changes focused on one concern.
- Add or update tests for behavior changes.
- Update documentation when public API behavior changes.
- Do not commit <code>.env</code>, credentials, API keys, or generated build output.
- Explain the user-facing or maintainer-facing reason for the change.
- Include the verification commands you ran.

Use imperative commit subjects, for example:

```text
fix: reject malformed idempotency keys
```

## Code style

The repository uses Prettier for formatting and TypeScript strictness for type safety. Prefer small, readable changes that follow the surrounding module structure.
