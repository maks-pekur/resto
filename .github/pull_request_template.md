<!--
PR title is the source of truth. Per project convention (CLAUDE.md), the
description body stays minimal — the "why" lives in the linked Linear
ticket and ADRs. Use the checklist below as a quick self-review prompt
before requesting review; delete sections that don't apply.
-->

## Linear

Closes RES-<id>

## Reviewer checklist

- [ ] Tests added / updated (unit, e2e, or RLS isolation as applicable).
- [ ] No raw SQL outside `packages/db/`.
- [ ] No new cross-context domain imports (use ports + adapters).
- [ ] Every new constructor param has `@Inject(...)`.
- [ ] DB migration adds RLS policies for new tenant-scoped tables.
- [ ] Public API contract changes are reflected in the OpenAPI spec.
- [ ] If a load-bearing infrastructure decision changed: ADR added.
