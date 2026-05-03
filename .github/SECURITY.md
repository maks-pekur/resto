# Security Policy

## Supported Versions

Resto is in active pre-release development (MVP-1). Until a tagged
`1.0.0` release ships, only the `main` branch is supported — fixes are
applied to `main` and made available through the next deploy.

## Reporting a Vulnerability

**Please do not open a public issue.** Email
`security@resto.app` (or the equivalent address documented in the
runbook for the deployed environment) with:

- A clear description of the issue and the impact.
- Steps to reproduce, including any required tenant context, headers,
  or sample payloads.
- The commit SHA / version where you observed the behaviour.
- Optional: a minimal patch idea, if you have one.

We aim to acknowledge reports within **2 business days** and to ship a
fix or mitigation within **30 days** for high-severity issues. Lower
severity items are scheduled into the regular release cadence.

## Scope

In scope:

- Tenant isolation bypass (RLS, AsyncLocalStorage, `withoutTenant`
  misuse, BYPASSRLS leaks).
- Authentication / authorization bypass on `apps/api` routes,
  including Better Auth wiring (when MVP-2 lands).
- Secret exposure (env files, logs, error responses).
- SQL injection, SSRF, deserialization, path traversal in any app.
- Outbox / event-bus spoofing of platform-level events.

Out of scope:

- Self-XSS that requires the user to paste attacker-controlled markup
  into the admin console.
- Denial-of-service via expensive but correct queries (rate-limiting
  is a planned project, not a security hole).
- Findings against third-party dependencies that are already covered
  by an upstream advisory and fixed in a newer version we have not
  yet upgraded to.

## Hall of Fame

Reporters who follow this policy and report a confirmed,
non-duplicate issue are credited (with consent) in the patch's
release notes.
