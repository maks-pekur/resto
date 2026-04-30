# docs/

## Purpose

Authoritative documentation for architecture decisions and externally-facing
API contracts.

## Layout

- `adr/` — Architecture Decision Records, numbered chronologically. Format
  follows MADR. `0000-template.md` is the template; copy it for a new ADR.
- `api/` — Generated OpenAPI specs and rendered docs. Source of truth for
  the public REST contract; clients are generated from these.
- `diagrams/` — C4 / sequence / ERD diagrams. Prefer Mermaid (renders in
  GitHub/Notion) over binary formats.

## Rules

- **ADRs are immutable** once status is `accepted`. To change a decision,
  write a new ADR with status `accepted` that supersedes the old one (set
  the old one to `superseded` and link forward).
- **Every load-bearing infrastructure or framework choice gets an ADR**
  before merge. "Why this and not the alternatives" is the point — code
  shows what, ADRs show why.
- **OpenAPI is the source of truth for the public API.** Hand-written
  client code that drifts from the spec is a CI failure once we wire
  contract checks.
