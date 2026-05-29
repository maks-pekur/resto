# Phase 3: Auth Completion (Security Core) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 03-auth-completion
**Areas discussed:** Email transport, Invitation flow UX, Scope cut (post-persona-review), RU localization (post-persona-review), AUTH-09 role-change (post-persona-review), Phase 17 placement (post-persona-review)

---

## Gray-area selection (multiSelect)

| Option                                            | Description                                                          | Selected                           |
| ------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------- |
| Email-транспорт: dev / test / prod                | Resend в prod + dev/test transport choice + templates + localization | ✓                                  |
| Invitation-flow + accept-invitation UX            | Где оператор приглашает, как привязывается роль, дубликат email, TTL | ✓                                  |
| 2FA TOTP UX и recovery-flow                       | Mandatory vs optional, recovery codes, lost-device                   | (delegated to Claude's Discretion) |
| AUTH-09: сид ролей + role-change audit workaround | Sid mechanism + BLOCKED row closure                                  | (delegated to Claude's Discretion) |

**User's choice:** Email-транспорт + Invitation-flow.
**Notes:** "за остальное не знаю" — explicit delegation. Recommended defaults presented before discussion proceeded; user accepted with no override ("да, идём"). Claude's Discretion captures: 2FA TOTP optional + 10 recovery codes + admin-reset-for-subordinate + email-recovery for owner; AUTH-09 idempotent Drizzle migration + custom NestJS PATCH endpoint via BA adapter for role-change audit. Both defaults were subsequently revised by persona reviews — see post-review sections below.

---

## Email transport — Q1: Dev / test transport choice

| Option                                            | Description                                                                     | Selected |
| ------------------------------------------------- | ------------------------------------------------------------------------------- | -------- |
| MailHog UI в dev + in-memory adapter в тестах     | Dev SMTP→MailHog (port 1025), tests use CapturedEmailAdapter, prod uses Resend  | ✓        |
| Resend везде + sandbox-адрес в dev/test           | Same code path, but requires RESEND_API_KEY everywhere, eats free tier on tests |          |
| Noop-адаптер + Pino-лог в dev, in-memory в тестах | Simpler dev setup, but email can't be visually verified                         |          |

**User's choice:** MailHog UI в dev + in-memory adapter в тестах (Recommended).

---

## Email transport — Q2: Visual style of 3 operator emails

| Option                                           | Description                                                                                                                                                                               | Selected |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Простой text + URL от BA                         | BA built-in plain text + URL. Zero template infrastructure. Phase 8 GNOTIF will introduce branded HTML for guest emails.                                                                  | ✓        |
| RestOS-фирменный HTML (логотип + простой лейаут) | Minimal HTML template (mjml or react-email): RestOS logo, brand color, CTA button. Needs render pipeline + plain-text fallback + dark-mode + Outlook/Gmail/Apple Mail compat.             |          |
| Per-tenant brand-themed                          | Operator emails styled as if from the restaurant. Strange for invite/reset (you're inviting an operator to RestOS, not to a restaurant). All the costs of HTML + tenant brand resolution. |          |

**User's choice:** Простой text + URL от BA (Recommended).

---

## Email transport — Q3: Localization

| Option                                                 | Description                                                                                                                                                   | Selected |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| EN и RU, выбор по Accept-Language или явный фаллбэк EN | At invite/signup take Accept-Language from HTTP request (ru/en, others fall back to en). 6 string constants per language.                                     | ✓        |
| EN-only в MVP-1, RU вот-вот потом                      | Minimum code. First RU client gets "Please verify your email" — friction at onboarding. RU founder dogfooding broken.                                         |          |
| EN + RU + явный operator.locale в BA-юзер (миграция)   | Add `locale` to BA additionalFields, user explicitly picks in settings. Excessive for Phase 3 — also still need Accept-Language fallback for invitation step. |          |

**User's choice:** EN + RU via Accept-Language с fallback EN (Recommended).
**Notes:** Subsequently challenged by Skeptic HIGH/MEDIUM (zero known RU paying customers in MVP-1, RU = founder personal comfort not product). User confirmed in post-review: keep EN+RU.

---

## Email transport — Q4: From / Reply-To

| Option                                       | Description                                                                                                                                                       | Selected |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| noreply@resto.app (платформенный)            | From: "RestOS <noreply@resto.app>", Reply-To: support@resto.app. resto.app verified in Resend once. Phase 8 (GNOTIF, guest) goes to per-tenant domain separately. | ✓        |
| noreply@<tenant-slug>.resto.app (per-tenant) | Each tenant gets a subdomain. Overkill for operator emails. Requires wildcard DKIM + DNS work per new tenant.                                                     |          |
| auth@resto.app + Reply-To noreply            | Separate transactional from marketing. MVP-1 has no marketing emails — premature split.                                                                           |          |

**User's choice:** noreply@resto.app платформенный (Recommended).

---

## Email transport — Q5: Continue or more questions

| Option                   | Description                                                                                                                           | Selected |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Дальше к Invitation-flow | Two core email decisions closed (transport, template policy). Remaining nuances (subject strings, retry/bounces) planner will decide. | ✓        |
| Ещё вопросы по email     | Bounce-handling, retry policy, suppression-list, prefix conventions                                                                   |          |

**User's choice:** Дальше к Invitation-flow (Recommended).

---

## Invitation flow — Q1: Where operator invites from

| Option                             | Description                                                                                                                                                  | Selected |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Новая страница /dashboard/staff    | Add Staff item to sidebar, new route /dashboard/staff. Member list + Invite button + role-dropdown. Evolves into pending-invitations + revoke + role-change. | ✓        |
| В существующую /dashboard/settings | No new sidebar item. Settings sprawls. Fine if staff = niche feature for small tenants (1-3 people), but per SPEC staff is first-class (10+ on a location).  |          |
| Только API в Phase 03, UI позже    | Operator calls BA-endpoint via curl/Postman. Excludes AUTH-02 from real flow — clearly not OK.                                                               |          |

**User's choice:** Новая страница /dashboard/staff (Recommended).
**Notes:** Subsequently revised by persona reviews (CTO HIGH-1 + Skeptic LOW-13) — full team page is Phase 17 / TEAM-01; Phase 3 minimal invite form lives in /dashboard/settings. Page name also changes from /dashboard/staff → /dashboard/team (CTO LOW-4 — avoid collision with `staff` role).

---

## Invitation flow — Q2: When to bind role

| Option                                             | Description                                                                                                                                                                             | Selected |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Оператор выбирает роль при invite                  | Dropdown in invite form (owner/admin/staff, owner-option only for owner-inviter). Role baked into token — cannot be tampered through client. Classic least-surprise + security pattern. | ✓        |
| Приглашённый выбирает сам при accept               | Invite token without role. Changes BA contract. Dangerous: anyone receiving link can choose owner.                                                                                      |          |
| Роль только staff при invite, овнер потом повышает | All new arrivals come as staff, owner manually promotes. Safer (can't accidentally invite admin) but friction — two actions instead of one.                                             |          |

**User's choice:** Оператор выбирает роль при invite (Recommended).

---

## Invitation flow — Q3: Duplicate email handling

| Option                                             | Description                                                                                                                                                                                          | Selected |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Auto-attach существующий аккаунт к tenant          | Accept invite → existing user logs in with password, added to new tenant with role from token. New tenant appears in brand-switcher. Supports consultant/co-owner working with multiple restaurants. | ✓        |
| Reject invite с явным email-ответом                | BA throws on invite. Operator sees "This email is already registered." Blocks legitimate multi-tenant membership.                                                                                    |          |
| Auto-attach + email-уведомление владельцу аккаунта | Like (1), but email owner gets second "You were added to <tenant>" without click. More secure (can't silently tug in), but adds 4th template and "how to opt out" invariant.                         |          |

**User's choice:** Auto-attach существующий аккаунт к tenant (Recommended).

---

## Invitation flow — Q4: Token TTL

| Option                                   | Description                                                                                                                                                              | Selected |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| BA дефолты: invite 48h, reset 1h         | OWASP recommends reset ≤ 1h. 48h on invite is pragmatic (Friday-invite Monday-accept). Nothing to add to BA config. Operator can manually revoke pending invite earlier. | ✓        |
| Invite 7d, reset 1h — extend only invite | More comfort for new tenants. Risk: larger window for token-stealing in inbox.                                                                                           |          |
| Invite 24h, reset 15min — стрictier      | On miss invite resends. Reset 15min excludes most replay attacks. User easily misses, support load grows.                                                                |          |

**User's choice:** BA defaults — invite 48h, reset 1h (Recommended + OWASP-aligned).

---

## Invitation flow — Q5: Continue or wrap up

| Option                      | Description                                                                                                                              | Selected |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Готов, веди к persona-ревью | Spawn persona-cto + persona-skeptic in parallel with user decisions + Claude's Discretion defaults. If HIGH findings → return with them. | ✓        |
| Обсудим ещё зоны            | Return to 2FA UX, AUTH-09 details, AUTH-08 cookie audit, AUTH-10 NATS DLQ full flow, AUTH-11 WeakMap, login-actions refactor             |          |

**User's choice:** Готов, веди к persona-ревью (Recommended).

---

## Post-persona-review — Q1: Scope cut

| Option                                                | Description                                                                                                                                                                                                                                                                                | Selected |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| CTO-вариант: разделить на 3a + 3b                     | Phase 3a (this pass): AUTH-01..06, 08, 10, 11, AUTH-09 seed only, carry-overs. Invite from minimal form in settings. Phase 3b (future): full /dashboard/team, AUTH-07 full 2FA UX, custom PATCH endpoint (if needed). Preserves all 11 AUTH reqs across two phases. Requires ROADMAP edit. | ✓        |
| Skeptic-вариант: per-item срезы в рамках этой Phase 3 | Don't split. Drop lost-device UI (keep enable+codes), full /dashboard/staff → list+invite-modal only, drop custom PATCH endpoint. All 11 AUTH reqs formally closed with minimal UX. ROADMAP unchanged.                                                                                     |          |
| Оставить как есть, слипаться по календарю             | Plan all 11 reqs + persona patches. Accept Phase 3 takes 1.5-2× longer than previous phases. Risk per CTO HIGH-1: visible UI eats time, security-critical (cookie sweep, DLQ, WeakMap) quietly slips.                                                                                      |          |

**User's choice:** CTO-вариант: разделить на 3a + 3b (Recommended).

---

## Post-persona-review — Q2: RU localization

| Option                                         | Description                                                                                                                                                                                                                       | Selected |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Оставить EN+RU как решили                      | RU realistic for soft-launch (founder + likely RU cohort). 6 string constants. Not the budget driver.                                                                                                                             | ✓        |
| EN-only с заготовкой под локализацию (Skeptic) | Strings in small `messages/en.ts` registry, all sends go through `getLocale(): 'en'` stub. When first RU client comes — add `messages/ru.ts` + Accept-Language logic, ~1 day. Save ~0.5-1 day now (2-language QA + copy changes). |          |

**User's choice:** Оставить EN+RU как решили.
**Notes:** User override of Skeptic MEDIUM-6 recommendation. Justification: founder is RU; soft-launch cohort likely RU; 6 strings × 2 languages is not the budget driver.

---

## Post-persona-review — Q3: AUTH-09 role-change

| Option                                                                   | Description                                                                                                                                                                                                                                                                               | Selected |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Skeptic-вариант: выбросить endpoint, оставить BLOCKED с явным trigger-ом | BLOCKED row in audit-gap.md remains, with explicit re-eval trigger: "first tenant adds 2nd member with role ≠ owner OR BA opens databaseHooks.member.update.after". Phase 3a AUTH-09 = role-seeding migration only. Save endpoint + contract + ACTION_TARGET_KIND + UI dropdown ≈ 2 days. | ✓        |
| CTO-вариант: сделать правильно в Phase 3a                                | Controller calls `auth.api.updateMemberRole(...)` (preserves BA permissions + session-invalidation), emits envelope in same request. BLOCKED closes. + e2e test admin cannot promote self to owner. Minus: still ~2 days in already-trimmed phase.                                        |          |
| Отложить весь AUTH-09 в Phase 3b/4                                       | No role seed, no audit. Owner created via bootstrap script; seed in BA `organization_role` unnecessary until 2nd member comes. Most aggressive cut — risky: absence of admin/staff presets may surface at first permission check.                                                         |          |

**User's choice:** Skeptic-вариант: выбросить endpoint, оставить BLOCKED с явным trigger-ом (Recommended).

---

## Post-persona-review — Q4: Phase 3b placement

| Option                                          | Description                                                                                                                                                                                                                                                                                    | Selected |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| После Phase 16 как Phase 17 (post-MVP-1 polish) | Phase 3 keeps number, gets rescoped to 3a content. New Phase 17 appended at end of MVP-1 (or formally in post-MVP-1 polish bucket) — activates when first multi-member tenant OR BA hook lands. Plus: 0 renumbering of Phase 4-16, clean semantics.                                            | ✓        |
| Сразу после Phase 3 как Phase 3b (вставка)      | Rename Phase 3 → Phase 3a, insert Phase 3b between it and Phase 4. Phase 4-16 keep numbers (decimal supported). Plus: 3b close to 3a contextually. Minus: forces planning right after 3a (instead of Catalog Phase 4) — breaks horizontal-layer-ordering decision in PROJECT.md Key Decisions. |          |

**User's choice:** После Phase 16 как Phase 17 (Recommended).

---

## Claude's Discretion (applied with persona-review revisions)

- **Wave ordering** inside Phase 3 plan (subject to DLQ-first constraint per Skeptic MED-7)
- **Whether Resend bounce-webhook ships in Phase 3** (D-08) or is deferred with documented limitation
- **Whether AUTH-11 WeakMap refactor stays in Phase 3** or slips to Phase 17 / tech-debt sweep (Skeptic LOW-11 recommends slip; default: keep, opportunistic since BA hook code is already being modified for D-13)
- **Resend free-tier visibility** (Skeptic MED-10 — startup log + circuit-breaker + WARN log on 4xx-rate-limit). Recommended: include.
- **Exact API shape of `getLocale(headers)` helper** — colocated with email adapter vs shared utility in `packages/`
- **2FA TOTP UX** — originally Claude's Discretion (optional + 10 codes + admin-reset-for-subordinate + email-recovery for owner); persona reviews revised: (a) keep optional + 10 codes + confirmation gate, (b) DROP admin-reset-for-subordinate UI (move to Phase 17 / TEAM-04), (c) DROP email-recovery loop for owner entirely (cancels 2FA security gain — both reviewers convergent), (d) document founder-side manual reset as runbook deliverable
- **AUTH-09 sid + workaround** — originally Claude's Discretion (idempotent Drizzle migration + custom PATCH endpoint); persona reviews revised: (a) NestJS bootstrap step instead of TS-importing migration, OR generated static SQL migration (CTO LOW-2), (b) DROP custom endpoint, keep BLOCKED row with explicit re-eval trigger (Skeptic HIGH-4, user-confirmed Q3)

---

## Deferred Ideas

- **Phase 17 / TEAM-01..05** — full /dashboard/team page, pending-invitations table, revoke, in-place role-change (via `auth.api.updateMemberRole`), 2FA lost-device admin-reset for subordinates, 2FA recovery code regen UI. Activation trigger: first paying tenant with 2nd member ≠ owner OR Better Auth ≥ 1.5 ships the missing hook.
- **Phase 8 GNOTIF** — branded HTML email templates (responsive, dark-mode, Outlook/Gmail/Apple Mail compat), per-tenant email sender domain ("от Ресторана Имя" for guest emails)
- **MVP-2 CRM phase** — per-user `locale` BA additionalField + UI selector (current MVP-1 fallback: Accept-Language detection)
- **Out of scope entirely (do not re-add without overturning in PROJECT.md Key Decisions)** — email-recovery loop for owner 2FA. Removed by CTO + Skeptic convergent finding (cancels 2FA security gain).
