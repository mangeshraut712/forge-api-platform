# Security Policy

## Supported versions

This project is an early-stage reference implementation. Only the latest version on the <code>main</code> branch is actively maintained.

## Reporting a vulnerability

Please do not open a public GitHub issue for a security vulnerability.

Use GitHub's private vulnerability reporting or Security Advisories for this repository when available. If that option is unavailable, contact [@mangeshraut712](https://github.com/mangeshraut712) privately through GitHub.

Include enough information to reproduce the issue, including:

- A description of the impact
- The affected component or endpoint
- Reproduction steps or a proof of concept
- Any suggested mitigation

Please allow reasonable time for investigation and remediation before making the issue public.

## Local development safety

- Never commit <code>.env</code> files or credentials.
- Use development-only API keys locally.
- Use a strong, separate <code>AUTH_SECRET</code> and <code>API_KEY_HASH_PEPPER</code> in production.
- Do not use development login settings in production.
