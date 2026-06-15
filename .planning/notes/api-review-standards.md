# Стандарты ревью RestOS API

> Планка, по которой судится backend/API. **Опираемся на индустриальные best practices, а не на прошлые внутренние аудиты** — прошлый аудит может сам ошибаться, поэтому каждое заключение пере-выводим из кода против стандартов ниже. Инварианты из `CLAUDE.md` — это то, что нужно **проверять**, а не принимать на веру.
>
> Severity: **BLOCK** = пробой между тенантами / потеря денег или данных / блокер «можем безопасно брать оплату». **HIGH** = эксплуатируемая в пределах тенанта дыра, неверная математика денег, эскалация прав, сломанный инвариант. **MEDIUM** = реально триггерящийся дефект или явное отклонение от best practice. **LOW** = качество/поддерживаемость.

---

## 1. Мультитенантная изоляция (defense-in-depth)

**Стандарт.** Изоляция тенанта усилена дважды — на уровне приложения (`ScopedTx`: `db.withTenant` / `db.withoutTenant`) **и** на уровне БД (Postgres RLS, `FORCE ROW LEVEL SECURITY`). Ни один уровень не достаточен в одиночку. `tenant_id` берётся только из аутентифицированного контекста, **никогда** из тела/заголовка/параметра, контролируемого клиентом.
**Критерии (checkable).**

- [ ] Каждый запрос к tenant-scoped таблице идёт через `ScopedTx`, не через сырой `tx`.
- [ ] `withoutTenant(reason)` — reason непустой и осмысленный, логируется на WARN; путь действительно cross-tenant по дизайну.
- [ ] `runInTenantContext` только в HTTP-middleware; фоновые задачи/NATS-консьюмеры/outbox — `db.withTenant(tenantId, …)`.
- [ ] На каждой tenant-scoped child-таблице composite FK `(parent_id, tenant_id) REFERENCES parent(id, tenant_id)`.
- [ ] RLS-политика существует и не слабее на **новых** таблицах (ordering, catalog Syrve/phase4a).
- [ ] **Brand** enforced не только на read, но и на write/uniqueness/FK/guard.
- [ ] Preflight-ассерты (`assertNoRlsBypass`, `assertTenantLockInstalled`, …) fail-closed на старте.
      **Ref.** OWASP API1 BOLA; AWS SaaS Lens multi-tenant data isolation; Postgres RLS docs.

## 2. AuthN / AuthZ / RBAC

**Стандарт.** Function-level и object-level авторизация на каждом мутирующем роуте. Read-only роль не может мутировать. Сервисные токены не обходят per-operator RBAC. Никакого mass-assignment.
**Критерии.**

- [ ] Каждый контроллер-роут имеет явные guard'ы; нет «случайного» `@Public()`.
- [ ] Мутации через `INTERNAL_API_TOKEN` **не** минуют `PermissionsGuard` / `BrandScopeGuard`.
- [ ] Роли (`SYSTEM_ROLES`) следуют least-privilege; `staff`/read-only не имеет write-прав на меню/заказы.
- [ ] `tenant_id`/`brand` для авторизации берутся из сессии/principal, не из клиентских заголовков.
- [ ] Сравнение секретов/токенов — timing-safe (`crypto.timingSafeEqual`).
- [ ] DTO не допускают mass-assignment (клиент не задаёт серверные поля: id, статусы, цены, tenant/brand).
      **Ref.** OWASP API1 BOLA, API2 Broken Auth, API3 Property-Level Auth, API5 BFLA.

## 3. Деньги и заказы

**Стандарт.** **Сервер — единственный источник истины по цене.** Цены/тоталы/цены модификаторов никогда не берутся из запроса клиента — пересчитываются из опубликованного меню. Деньги — целые minor units (копейки), не float. Валюта явная. Создание заказа и платёж идемпотентны.
**Критерии.**

- [ ] Цена позиции/модификатора резолвится по `published-menu`, а не из payload'а.
- [ ] Все суммы — integer minor units; округление детерминировано; нет float-арифметики денег.
- [ ] `quantity` > 0; запрет отрицательных/нулевых; `min/max` модификаторов enforced на сервере.
- [ ] Stop-list / доступность проверяются **в момент заказа**.
- [ ] `Idempotency-Key` на create order / payment → ретрай не создаёт дубль (exactly-once-effect).
- [ ] Optimistic concurrency (version) на мутации заказа; нелегальные переходы state-machine отклоняются.
- [ ] Stripe Connect: проверка подписи webhook, пересчёт суммы на сервере, нет касания PAN (PCI вне периметра).
      **Ref.** Stripe idempotency & webhook signature docs; OWASP API "business logic" guidance; PCI-DSS SAQ-A модель.

## 4. Надёжность событий (outbox / inbox)

**Стандарт.** Transactional outbox с at-least-once доставкой; консьюмеры идемпотентны (inbox-dedup в **той же** транзакции, что и side effects). Poison-сообщения не теряются. Защита от двойной публикации.
**Критерии.**

- [ ] Запись в outbox — в одной транзакции с изменением состояния.
- [ ] Маркер inbox вставляется в той же tx, что и обработчик (`runDeduped`).
- [ ] Claim/ownership при поллинге — два диспетчера не публикуют одно и то же; leader-election без гонок.
- [ ] Poison/повторно падающее сообщение → DLQ или cap ретраев, не тихий drop.
- [ ] `correlationId` из OTel-спана через `buildEnvelope`; нет сырого `randomUUID()`.
- [ ] Версионирование контрактов событий (`<ctx>.<event>.v<n>`), обратная совместимость.
- [ ] Порядок сохраняется там, где он семантически важен (или консьюмер order-tolerant).
      **Ref.** microservices.io Transactional Outbox & Idempotent Consumer; NATS JetStream ack semantics.

## 5. HTTP-контракты, ошибки, валидация

**Стандарт.** RFC 7807 `application/problem+json`, корректная семантика статусов, полная редакция внутренних деталей на 5xx, валидация на границе, лимиты на коллекциях.
**Критерии.**

- [ ] Все ошибки → problem+json; `type` URI стабильный; маппинг domain-ошибок полный (нет «голых» 500).
- [ ] На 5xx редактируются `detail`, `title` и любые extensions — никакой утечки схемы/SQL.
- [ ] Каждый body/param/query валидируется (`RestoZodValidationPipe`).
- [ ] Нет excessive data exposure — ответы не отдают внутренние поля (`tenant_id`, audit-поля и т.п.) без нужды.
- [ ] Коллекции имеют pagination/limit (защита от API4).
- [ ] Мутирующие эндпоинты поддерживают `Idempotency-Key` где уместно.
- [ ] OpenAPI (`docs/api/openapi.yaml`) синхронен с контроллерами (нет «теневых»/недокументированных роутов — API9).
      **Ref.** RFC 7807; OWASP API3, API4, API9.

## 6. Кэш и graceful degradation

**Стандарт.** Падение опциональной зависимости (Redis-кэш меню) не должно ронять горячий путь — деградация, не 5xx. Кэш-ключи изолированы по tenant+brand+version.
**Критерии.**

- [ ] Redis недоступен → публичное меню отдаётся из БД (degraded), без 5xx.
- [ ] Cache-key включает tenant, brand и версию меню; нет коллизий между тенантами/брендами.
- [ ] Инвалидация при publish корректна — не отдаётся устаревшая/чужая версия.
- [ ] Публичное чтение поддерживает ETag/conditional requests (version-keyed) для CDN.
      **Ref.** Cache-Aside pattern; HTTP conditional requests (RFC 9110 §13).

## 7. Данные / схема / миграции

**Стандарт.** Целостность через FK, индексы на горячих путях, soft-delete вместо hard-delete, RLS в миграциях совпадает со схемой.
**Критерии.**

- [ ] Индексы на колонках hot-запросов: публичное чтение меню, lookup заказа, polling outbox, tenant-фильтры, FK-колонки.
- [ ] FK `ON DELETE` не нарушает no-hard-delete и не оставляет сирот.
- [ ] Uniqueness-констрейнты включают brand-измерение там, где бренд изолирует.
- [ ] Soft-delete реально enforced где есть `archived_at` (нет путей, читающих архивные как активные).
- [ ] Колонки, которые не должны быть NULL, — `NOT NULL`; дефолты новых Syrve/ordering-колонок корректны.
- [ ] `resto_app` без `DELETE`-привилегии (hard delete невозможен ролью приложения).
      **Ref.** Postgres constraints & indexing; реляционная целостность.

## 8. Конфиг, секреты, boot-guardrails

**Стандарт.** Все env валидируются на старте (Zod), отсутствие required-var → краш до маунта контроллеров. Prod-guardrails fail-closed. Секреты не логируются и не в образе.
**Критерии.**

- [ ] Каждая required-в-проде переменная enforced; нет dev-дефолта, доезжающего до прода.
- [ ] `assertProdGuardrails` отклоняет dev-fallback значения вне `development`/`test`.
- [ ] Секреты инжектятся в рантайме (Vault/Secrets Manager), не в `.env`-образе.
- [ ] Логи redact'ят `password`, `token`, `email`, `phone`, `params`.
- [ ] `trust-proxy` настроен так, что клиент не подделает IP / `X-Forwarded-*`.
- [ ] Host-резолюция (effective-host, tenant-context) не доверяет `Host`/`X-Forwarded-Host` слепо; cookie scope/SameSite захардены.
      **Ref.** OWASP API8 Security Misconfiguration; 12-factor config; OWASP Secrets Management Cheat Sheet.

## 9. Rate limiting / resource consumption

**Стандарт.** Лимиты эффективны **между репликами** (distributed), а не per-process. Защита signin, публичного меню и create-order от абьюза. Per-tenant fairness — нет noisy-neighbor.
**Критерии.**

- [ ] Rate-limit состояние общее (Redis/хранилище), не in-memory на процесс.
- [ ] Лимиты на: signin (brute-force), публичное меню (scraping), create order (спам/DoS).
- [ ] Ключ лимита не подделывается клиентским IP/заголовком.
- [ ] Нет per-tenant амплификации, роняющей соседей в пик (Friday-evening spike).
      **Ref.** OWASP API4 Unrestricted Resource Consumption; token-bucket/sliding-window.

## 10. Архитектура / DDD-слои

**Стандарт.** `domain/` свободен от framework/infra импортов; инварианты агрегатов защищены; зависимость на порты, не на адаптеры; границы модулей соблюдены.
**Критерии.**

- [ ] В `domain/` нет `@nestjs/*`, `drizzle-orm`, `postgres`, инфра-импортов.
- [ ] Агрегаты: приватные конструкторы, валидация в `fromSnapshot`, события дренируются (`pullEvents`); нет публичных сеттеров, ломающих инвариант.
- [ ] Application-сервисы зависят от port-интерфейсов (Symbol-токены), не от конкретных классов.
- [ ] Apps не импортят другие apps; пакеты — только через `src/index.ts` (нет sub-path импортов).
- [ ] Domain-ошибки не несут HTTP-статус/`HttpException`; маппинг — в `interfaces/http/error-mapping.ts`.
- [ ] Нет floating promises (`no-floating-promises`), `any`, non-null `!`, нарушений `noUncheckedIndexedAccess`.
      **Ref.** Clean Architecture / DDD; гексагональная архитектура (ports & adapters).

## 11. Тесты и достоверность сигнала

**Стандарт.** Набор тестов **реально исполняется** (не тихий SKIP при отсутствии Docker/Postgres), ассерты на наблюдаемые side effects, моки не прячут реальное RLS/brand-scope поведение.
**Критерии.**

- [ ] Нет конфигурации, при которой isolation/e2e-набор «зеленеет» без поднятой БД (false signal) — отсутствие инфры должно **падать**, а не скипаться молча.
- [ ] Критические пути покрыты: математика денег ordering, state-machine, идемпотентность/concurrency create-order.
- [ ] Ассерты проверяют observable side effects (записи в БД, опубликованные события), не call-shape.
- [ ] Есть e2e на brand-scope enforcement и degraded-mode (Redis/зависимость down).
- [ ] Фикстуры — production-shape данные.
      **Ref.** Test Pyramid; «верифицируй фичу, а не форму вызова» (см. память проекта).

## 12. Наблюдаемость

**Стандарт.** Структурные логи (pino, JSON), OTel-трейсинг, сквозной `correlationId`. Достаточно сигналов, чтобы диагностировать инцидент с оплатой/заказом.
**Критерии.**

- [ ] `correlationId` пронизывает HTTP → outbox → консьюмеры.
- [ ] 5xx логируются на `error`, 4xx — на `warn`, с контекстом (без секретов/PII).
- [ ] Ключевые бизнес-события (создание/оплата/фейл заказа) трассируются.
      **Ref.** OpenTelemetry semantic conventions; structured logging.

## 13. Приватность / GDPR

**Стандарт.** Полный erasure-pipeline (30-дн cool-off, анонимизация через `AUDIT_ERASURE_SALT`), аудит-лог всех касаний PII, PCI вне периметра (Stripe токенизирует).
**Критерии.**

- [ ] Erasure действительно покрывает все PII-таблицы (включая новые ordering-данные с PII покупателя).
- [ ] Доступ к PII логируется в audit-контексте.
- [ ] Нет прямого хранения карточных данных.
      **Ref.** GDPR Art.17 (right to erasure); PCI-DSS SAQ-A.

---

### Внешние источники (canonical)

- OWASP API Security Top 10 (2023): https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- RFC 7807 Problem Details: https://www.rfc-editor.org/rfc/rfc7807
- microservices.io — Transactional Outbox / Idempotent Consumer: https://microservices.io/patterns/data/transactional-outbox.html
- Stripe — Idempotent requests & webhook signatures: https://docs.stripe.com/api/idempotent_requests
- Postgres Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
