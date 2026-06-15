---
date: 2026-06-15
type: deep-api-review
method: 10-dimension multi-agent fan-out + adversarial verification (refute-by-default)
baseline: industry best practice (OWASP API Top-10 2023, money/order-API, multi-tenant defense-in-depth) — NOT prior AUDIT.md
agents: 83 | findings raised: 69 | survived: 68 | refuted: 1
severity (as raised): 8 BLOCK · 17 HIGH · 21 MEDIUM · 19 LOW · 3 INFO
standards: see .planning/notes/api-review-standards.md
---

> **Достоверность / пробелы верификации (важно).** Прогон уперся в session-лимит ближе к концу. Adversarial-верификацию (2 скептика на BLOCK/HIGH) **реально прошли** измерения: ordering-context, tenancy-isolation, http-contracts, events-outbox, config-security-bootstrap. **НЕ прошли** верификацию (верификаторы упали по лимиту, находки приняты «как есть»): authz-rbac, catalog-context, data-migrations, domain-layering — их HIGH/BLOCK (BLOCK-2 GDPR, HIGH-7 internal-token, HIGH-8 ETag, HIGH-9 payments-unique, HIGH-10 RLS-assertion) **требуют ручного подтверждения**, хотя большинство — простые проверяемые по коду факты и часть продублирована верифицированными находками. Измерение **testing-quality** не отработало вовсе (ревьюер упал) — отдельные тест-наблюдения разбросаны по другим находкам. Severity в шапке — «как поднято»; внутри тела учтены понижения/повышения верификаторов.

# Аудит API RestOS — финальный отчёт ревью

_Оценка против современной планки SaaS (OWASP API Top-10 2023, практики money/order-API, multi-tenant defense-in-depth). Severity объясняется один раз простыми словами:_

- **BLOCK** — утечка данных между арендаторами, потеря денег, неустранимая порча данных, или прямой блокер к тому, чтобы «безопасно принять деньги платящего клиента». Чинить до запуска.
- **HIGH** — эксплуатируемая внутри одного арендатора уязвимость, неверная математика заказа/денег, повышение привилегий, сломанный инвариант, OWASP-класс уязвимости.
- **MEDIUM** — реальный дефект корректности/устойчивости с конкретным триггером или явное отклонение от лучших практик с последствиями.
- **LOW** — качество кода/поддерживаемость.

---

## 1. Резюме

Платформенный фундамент (мультиарендность, RLS, каталог, OpenAPI-дисциплина, prod-guardrails) находится на уровне зрелого SaaS — изоляция арендаторов держится за счёт двух рубежей (`ScopedTx` + Postgres RLS), и ни один проверенный дефект не даёт **межарендной** утечки в текущем коде. **Однако весь контекст `ordering` — самый свежий и наименее протестированный — фундаментально не готов к деньгам.** Главное, что нужно исправить: **сервер не является источником цен.** Анонимный гость на публичном `POST /v1/orders` присылает `unitPrice`, `priceDelta` и произвольный `discountSpec` (включая скидку 100%) прямо в теле запроса, и сервер сохраняет это как авторитетный итог заказа — никакого обращения к опубликованному каталогу нет вообще. Это означает, что планка «можно безопасно принять деньги платящего клиента» **под прямой угрозой**: в момент, когда подключат оплату к `order.total`, любой гость купит что угодно за 0.01 или за ноль. К этому добавляются: GDPR-стирание не трогает таблицы заказов/платежей (PII выживает после «права на забвение»), у `payments.provider_payment_id` нет уникального ограничения (двойная вставка при ретраях вебхуков Stripe), prod-guardrail пропускает подменённые `BETTER_AUTH_SECRET`/`AUDIT_ERASURE_SALT` из `.env.example` (потенциальный обход аутентификации всех арендаторов), и весь жизненный цикл заказа после создания (оплата/приём/возврат) попросту не реализован на уровне HTTP. **Вывод: каталог и фундамент готовы; ordering — это стройплощадка, и принимать на нём реальные деньги сейчас нельзя.**

---

## 2. Светофор по областям

| Область                        | Статус | Одной строкой                                                                                                                                                    |
| ------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Изоляция арендаторов (tenancy) | 🟡     | Два рубежа держатся, RLS работает; но `ordering` обходит `ScopedTx`, нет FK на `menu_item_id`/`option_id`, brand не проверяется на заказе.                       |
| Авторизация / RBAC             | 🟡     | Catalog-RBAC в порядке, но lifecycle-операции арендаторов держатся на одном общем токене без атрибуции; create-route требует `menu:update` вместо `menu:create`. |
| Контекст ordering (деньги)     | 🔴     | Сервер не источник цен; произвольная скидка обнуляет заказ; amount модификатора не учитывается; lifecycle/оплата не реализованы.                                 |
| Контекст catalog               | 🟡     | Корректный по изоляции, но published-status-правки минуют ETag (stale-меню до 5 мин); admin-чтения не scoped по brand.                                           |
| HTTP-контракты                 | 🟡     | RFC 7807 в целом соблюдён; но OpenAPI врёт про тело ответа заказа, невалидные UUID → 500, часть conflict-ошибок без `code`.                                      |
| События / outbox               | 🟢     | Outbox + inbox-дедуп солидны; мелкие огрехи (hardcoded USD/0 в paid/refunded, индекс reclaim).                                                                   |
| Миграции / схема данных        | 🔴     | GDPR-стирание не покрывает ordering; нет unique на `provider_payment_id`; нет boot-проверки RLS-FORCE по таблицам.                                               |
| Конфиг / секреты / bootstrap   | 🔴     | Guardrail fail-open на двух самых критичных секретах; rate-limit полностью in-memory (неэффективен на >1 реплике EKS).                                           |
| DDD-слоистость                 | 🟡     | Структура чистая; `brand.aggregate.ts` — пустой интерфейс, один application-файл бросает HTTP-исключение.                                                        |
| Тестовое покрытие              | 🟡     | Ordering HTTP-контракт не тестируется без Docker; новые таблицы вне RLS-регресс-набора; money-тест проверяет фикцию.                                             |

---

## 3. Находки по severity

> Многие ревьюеры независимо подняли одну и ту же проблему ценовой авторизации в `create-order.service.ts` (измерения ordering-context, authz-rbac, catalog-context, http-contracts, domain-layering). Они объединены ниже в **BLOCK-1** с указанием всех файлов.

### 🔴 BLOCK

#### BLOCK-1. Сервер не является источником цен: client-supplied `unitPrice`/`priceDelta`/`discountSpec` принимаются и сохраняются как итог заказа

**Severity: BLOCK** (подтверждено множеством ревьюеров независимо)
**Файлы:**

- `apps/api/src/contexts/ordering/application/create-order.service.ts:28-57` (маппинг client→domain без lookup)
- `apps/api/src/contexts/ordering/application/dto.ts:9,18,19,40` (`unitPrice`, `priceDelta`, `currency`, `discountSpec` из тела)
- `apps/api/src/contexts/ordering/domain/order.aggregate.ts:103-132` (`computeTotals` считает по клиентским значениям)
- `apps/api/src/contexts/ordering/domain/discount.ts:7,67-68` (`pct` без верхней границы, clamp только до eligible base)
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts:16,23` (`@Public()` + `@RequireActiveTenant()`)

**Что не так.** Подтверждено чтением кода: `CreateOrderService` инжектит только `ORDER_REPOSITORY` (строка 10) — каталога нет вообще. `domainItems` строятся прямо из `item.unitPrice`/`m.priceDelta`/`item.name` (строки 28-42), `computeTotals` берёт `toMinorUnits(item.unitPrice)` (`order.aggregate.ts:104`), а `discountSpec` уходит насквозь (`create-order.service.ts:55`). Эндпоинт публичный и неаутентифицированный. Скидка `{kind:'percentage',scope:'cart',pct:100}` даёт `total = 0` (`discount.ts:67-68`, clamp до eligible). Нет ни обращения к опубликованной цене, ни проверки, что `itemId`/`optionId` существуют и принадлежат бренду.

**Последствие.** Любой анонимный гость создаёт заказ на любой итог, включая бесплатный или со 100%-скидкой. Когда оплата будет привязана к `order.total` — прямая потеря денег на каждом заказе. Это и есть барьер «можно ли безопасно принять деньги клиента».

**Нарушает.** OWASP API3:2023 (mass-assignment ценовых свойств), money/order best practice: сервер — единственный источник цен и скидок.

**Как чинить.** В `CreateOrderService` загружать каждый `itemId`/`sizeId`/`optionId` из опубликованного меню (scoped по tenant+brand через `ScopedTx`), пересчитывать `unitPrice`/`priceDelta`/line-total на сервере, игнорировать клиентские цены (оставить `name` только как display-снимок). Скидки резолвить server-side из таблицы промо по promo-id, а не принимать готовый объект. Отклонять (422) строки с неопубликованным/stop-listed/чужебрендовым item.

---

#### BLOCK-2. GDPR-стирание оставляет PII заказов/платежей навсегда — `tenancy_erase_tenant` не трогает ordering-таблицы

**Severity: BLOCK** (понижение до MEDIUM в одном tenancy-измерении, но в data-migrations-измерении подтверждён как BLOCK — беру более строгую как профильную для compliance-риска перед EU-запуском)
**Файлы:**

- `packages/db/migrations/0041_tenancy_erase_phase4a_tables.sql:60-84` (тело функции без orders/payments)
- `packages/db/src/schema/ordering.ts:30-31,135` (`customer_name`, `customer_phone`, `provider_payment_id`)
- `apps/api/src/contexts/tenancy/infrastructure/tenant-drizzle.repository.ts:217-244` (никогда не делает `DELETE FROM tenants`)

**Что не так.** `tenancy_erase_tenant` (последняя ревизия — 0041, до создания ordering в 0049) удаляет/анонимизирует outbox/inbox/menu\_\*/customer_profiles/brands/members, но **не** `orders`, `order_items`, `order_modifiers`, `payments`. Стирание — это анонимизация-на-месте под `withoutTenant`; строка `tenants` никогда не удаляется, поэтому `ON DELETE cascade` на `orders_tenant_fk` не срабатывает. Имя/телефон гостя и платёжные идентификаторы остаются в БД бессрочно. Ни один тест не проверяет покрытие ordering функцией стирания — пробел молчаливый.

**Последствие.** «Право на забвение» (GDPR Art.17) завершается успешно с точки зрения оператора, но PII клиента и история платежей сохраняются. Прямое нарушение compliance перед приёмом реальных клиентов в EU.

**Нарушает.** GDPR Art.17; собственный инвариант проекта (CLAUDE.md Compliance, `packages/db/CLAUDE.md` «каждая новая tenant-scoped таблица нуждается в записи в erase-пути»).

**Как чинить.** Новая миграция: анонимизировать/обнулить PII в `orders` (customer_name/phone/table_identifier), `order_items` (name_snapshot если несёт PII), `payments` (provider_payment_id), salted по `AUDIT_ERASURE_SALT`. Добавить интеграционный тест, перечисляющий tenant-scoped таблицы программно, чтобы новые таблицы падали тест до добавления.

---

#### BLOCK-3. Lifecycle заказа и оплата не реализованы на уровне HTTP — заказ нельзя оплатить/принять/выполнить/вернуть

**Severity: BLOCK**
**Файлы:**

- `apps/api/src/contexts/ordering/domain/order.aggregate.ts:191-312` (`markPaid/accept/.../refund` без вызывающих)
- `apps/api/src/contexts/ordering/ordering.module.ts:13-18` (нет payment-сервиса/Stripe-порта)
- `apps/api/src/contexts/ordering/interfaces/http/orders.controller.ts:21` (только `@Post`)
- `packages/db/src/schema/ordering.ts:125` (`payments` существует, но в неё ничего не пишется)

**Что не так.** Grep по всему репо: методы `markPaid/accept/startPreparing/markReady/complete/cancel/refund/markFailed` вызываются только в spec. Нет payment-сервиса, нет Stripe-адаптера в `OrderingModule` (единственный Stripe — `NoopStripeConnectAdapter` в tenancy, заглушка MVP-2). `save()` — INSERT-only с `onConflictDoNothing`, UPDATE-пути нет, статус заказа неизменяем. `GetOrderService` зарегистрирован, но не имеет HTTP-маршрута — заказ даже нельзя прочитать обратно.

**Последствие.** Заявленная ценность («гости размещают оплаченные заказы, которые ресторан выполняет») недостижима: заказ создаётся и навсегда застревает в `created`. Планка MVP-1 не выполнена.

**Нарушает.** MVP money-readiness; Stripe Connect best practice (server-computed amount, webhook signature verification, идемпотентный capture).

**Как чинить.** Реализовать payment-intent/capture (Stripe Connect) с server-recomputed amount, идемпотентностью по order-id, верификацией подписи вебхука, ведущей `markPaid/markFailed/refund`. Добавить операторские/клиентские маршруты для смены статуса и `GET /v1/orders/:id`.

---

#### BLOCK-4. Prod-guardrail fail-open для `BETTER_AUTH_SECRET` и `AUDIT_ERASURE_SALT` — placeholder из `.env.example` проходит в прод

**Severity: BLOCK** (один ревьюер дал HIGH, второй BLOCK — беру BLOCK: leaked `BETTER_AUTH_SECRET` = межарендный обход аутентификации)
**Файлы:**

- `apps/api/src/config/prod-guardrails.ts:15-21,68-74` (`DEV_DEFAULTS` без `BETTER_AUTH_SECRET`; цикл только по ключам `DEV_DEFAULTS`)
- `apps/api/src/contexts/identity/identity-core.module.ts:255` (`env.BETTER_AUTH_SECRET ?? DEV_BA_SECRET_FALLBACK` — ключ подписи BA)
- `.env.example:34,127` (placeholder'ы ≥32 символов, проходят `min(32)`)

**Что не так.** `assertProdGuardrails` отклоняет boot только если значение равно зашитой константе из `DEV_DEFAULTS`. `BETTER_AUTH_SECRET` в `DEV_DEFAULTS` **отсутствует** — никогда не проверяется. `AUDIT_ERASURE_SALT` присутствует, но с литералом `'dev-only-erasure-salt-32-chars-padding'`, тогда как в `.env.example` отгружается **другая** строка `local-dev-erasure-salt-replace-me-...`. Оба placeholder ≥32 символов → проходят схему. Контраст: `INTERNAL_API_TOKEN` и `S3_*` placeholder совпадают с `DEV_DEFAULTS` и корректно отлавливаются — то есть это именно несогласованность для двух самых критичных секретов.

**Последствие.** Известный `BETTER_AUTH_SECRET` позволяет подделать session-cookie/bearer-token любого пользователя в любом арендаторе — полный обход аутентификации и межарендный захват. Известный `AUDIT_ERASURE_SALT` делает GDPR-анонимизацию обратимой. Триггер — оператор копирует `.env.example` в прод-секреты и забывает заменить эти две строки (именно сценарий, ради которого guardrail и существует).

**Нарушает.** OWASP API8 Security Misconfiguration; secrets-management (no shipped/default secrets reach prod, fail-closed).

**Как чинить.** Добавить `BETTER_AUTH_SECRET` в охраняемый набор и отклонять при равенстве `DEV_BA_SECRET_FALLBACK` или любому placeholder из `.env.example`; согласовать литерал `AUDIT_ERASURE_SALT` с реально отгружаемой строкой; вывести `DEV_DEFAULTS` и `.env.example` из одного источника констант, чтобы они не расходились; отклонять низкоэнтропийные секреты (`dev`/`local`/`replace`/`change_me`).

---

### 🟠 HIGH

#### HIGH-1. `order_items.menu_item_id` и `order_modifiers.option_id` без foreign key — нет referential integrity, FK-аудит их не видит

**Severity: HIGH** • `packages/db/src/schema/ordering.ts:70-123` (+ `migrations/0049_ordering_tables.sql:33-65`, `src/cli/audit-fks.ts:34-42`)

`menu_item_id`/`option_id`/`modifier_group_id` — value-only UUID без FK к `menu_items`/`menu_modifier_options`. Нарушает ADR-0020 I-2 (composite FK `(parent_id, tenant_id)`). `menu_items` — brand-scoped, поэтому реальный FK заодно бы проверял brand. `audit-fks.ts` сканирует только существующие single-column FK (`cardinality(conkey)=1`), поэтому **отсутствующий** FK ему структурно невидим — ложная уверенность. Заказ может ссылаться на item чужого бренда или на мусорный UUID (тест `tenant-isolation.spec.ts:616` это «бетонирует»: вставка несуществующего menuItemId проходит). **Фикс:** composite FK на `(menu_item_id, tenant_id)` и `(option_id, tenant_id)`; добавить `brand_id` в `order_items` с composite brand-FK; расширить `audit-fks.ts`, чтобы он сообщал об отсутствующих FK.

#### HIGH-2. Создание заказа доверяет client `itemId`/`brandId` без проверки принадлежности бренду/арендатору (within-tenant BOLA)

**Severity: HIGH** (один ревьюер дал MEDIUM из-за «нет раскрытия данных», но второй — HIGH; беру HIGH: неаутентифицированный endpoint + сломанный заявленный brand-инвариант) • `apps/api/src/contexts/ordering/application/create-order.service.ts:28-57`

Никакого catalog-lookup: `brandId = ctx.brandId ?? ''`, item/option-id принимаются вслепую. Гость на хосте бренда A может прикрепить `itemId`/`optionId` бренда B того же арендатора; FK отсутствует (HIGH-1), поэтому ничего не ловит. **Фикс:** загружать каждый referenced объект под активным tenant/brand, отклонять (422) item с `brand_id != resolved brandId` или неопубликованный/stop-listed; требовать resolved `brandId`.

#### HIGH-3. Stop-list / доступность не проверяются при заказе — снятые с продажи (86'd) позиции заказуемы

**Severity: HIGH** • `apps/api/src/contexts/ordering/application/create-order.service.ts:28-59` (+ `domain/errors.ts:29`, `interfaces/http/error-mapping.ts:19`)

`OrderItemUnavailableError` определена и замаплена на 422, но grep показывает — она **никогда не бросается** (мёртвый код). `CreateOrderService` не запрашивает каталог/stop-list. Гость заказывает позицию, которую ресторан явно снял с продажи; кухня получает невыполнимый заказ. **Фикс:** при создании загружать опубликованное меню, проверять существование/публикацию/stop-list каждого id, бросать `OrderItemUnavailableError`. Это тот же lookup, что нужен для ценовой авторизации (BLOCK-1) — делать один раз.

#### HIGH-4. Количество модификатора (`amount`) теряется в расчёте — multi-quantity модификаторы недозаряжаются

**Severity: HIGH** • `apps/api/src/contexts/ordering/domain/order.aggregate.ts:105-106`

`modifierMinor = reduce(sum + toMinorUnits(m.priceDelta), 0)` — `priceDelta` суммируется ровно один раз; `m.amount` **никогда не умножается** в цену, хотя парсится (`dto.ts:11`), переносится (`create-order.service.ts:37`) и сохраняется (`order-drizzle.repository.ts:101`). Заказ «3× платный сыр» заряжается как 1×, а кухня видит amount=3. Все spec-тесты используют `amount:1`, поэтому путь не покрыт. **Фикс:** `modifierMinor += toMinorUnits(m.priceDelta) * m.amount`; тест на `amount>1`; заодно соблюдать `freeAmount/minAmount/maxAmount`.

#### HIGH-5. Min/max выбора модификаторов и required-группы не проверяются server-side

**Severity: HIGH** (один ревьюер MEDIUM, второй HIGH; беру HIGH как профильную для money/order-path) • `apps/api/src/contexts/ordering/application/create-order.service.ts:28-59`

Опубликованное меню задаёт `minSelectable/maxSelectable/isRequired` на группу и `minAmount/maxAmount` на опцию (`catalog/domain/published-menu.ts:40-63`), но order-path принимает любой набор модификаторов с любым amount и не требует опций из обязательных групп. `OrderingModule` не импортирует каталог — проверка структурно невозможна. **Фикс:** при server-side резолве меню валидировать выбор против group min/max/required и option min/max amount; 422 при нарушении.

#### HIGH-6. Brand-изоляция на заказе — заглушка; принадлежность item/option бренду не проверяется

**Severity: HIGH** • `apps/api/src/contexts/ordering/application/create-order.service.ts:46` (+ `packages/db/src/schema/ordering.ts:52-56`)

`brandId = ctx.brandId ?? ''`; `orders_brand_fk` `(brand_id, tenant_id)` отклонит пустой/чужой brand на хостах с реальным брендом, но application-слой не проверяет, что заказанные `menuItemId`/`optionId` принадлежат этому бренду. (Перекрывается с HIGH-1/HIGH-2 — это та же дыра с разных углов; чинится тем же catalog-lookup.) Доп. дефект: `''` достигает uuid-колонки на tenant-only пути → 22P02 → 500 вместо чистого 4xx.

#### HIGH-7. Все lifecycle-мутации арендатора/бренда/владельца защищены одним общим статическим internal-токеном — без per-operator RBAC и атрибуции

**Severity: HIGH** • `apps/api/src/contexts/tenancy/interfaces/http/internal-tenants.controller.ts:52-56` (+ `identity/.../internal-bootstrap.controller.ts:69-78`, `shared/api/internal-token.guard.ts`)

`provision/archive/offboard/suspend/resume` и создание первого владельца (с выбранным паролем) защищены `@Public()` + `InternalTokenGuard`, который проверяет лишь равенство одного общего `X-Internal-Token`. Нет идентичности оператора, нет проверки роли, нет аудита «кто действовал». В `NODE_ENV=development` отсутствие токена разрешено целиком (guard:43). **Фикс:** перед приёмом клиентов вынести lifecycle+bootstrap за реальную операторскую аутентификацию с platform-admin-ролью (или сетево изолировать control-plane); per-actor аудит; fail-closed во всех средах для деструктивных маршрутов.

#### HIGH-8. Правки контента в published-статусе минуют menu-ETag — CDN отдаёт устаревшее меню до 5 минут

**Severity: HIGH** • `apps/api/src/contexts/catalog/interfaces/http/public-menu.controller.ts:172-183` (+ `catalog-drizzle.repository.ts:92-242`, `upsert-item.service.ts:60`)

ETag строится из `menuVersions.current()`, а видимость контента решается `menu_items.status`, который `UpsertItemService` пишет напрямую из `input.status`. Версия бампается **только** `/publish`. Значит `POST /v1/catalog/items` со `status:'published'` (или archive published item) меняет тело меню немедленно, а ETag не меняется → edge-кэш отдаёт старое до `s-maxage=300`, а условный 304 подтверждает устаревший контент. Гость может заказать только что 86'd-позицию. **Фикс:** бампать `catalog_menu_version` в той же транзакции, что и любая published-content-мутация, либо завязать публичное чтение на published-версию (snapshot). Минимум — archive/unarchive published item обязан бампать версию.

#### HIGH-9. `payments.provider_payment_id` без уникального ограничения — ретраи вебхуков Stripe удваивают строки платежей

**Severity: HIGH** • `packages/db/src/schema/ordering.ts:125-159` (+ `migrations/0049_ordering_tables.sql`)

`providerPaymentId text` без unique-индекса и без индекса по `order_id`. Stripe доставляет вебхуки at-least-once; канонический idempotency-fence — unique на provider payment id. Без `UNIQUE (tenant_id, provider_payment_id)` повторный `payment_intent.succeeded` вставит вторую строку. **Фикс:** partial `uniqueIndex('payments_provider_payment_uq').on(tenantId, providerPaymentId).where(provider_payment_id IS NOT NULL)` + `index(tenantId, orderId)`; webhook делает upsert по этому ключу. Сделать **до** интеграции Stripe, чтобы ограничение предшествовало реальным деньгам.

#### HIGH-10. Нет boot/тест-проверки, что у каждой tenant-scoped таблицы RLS ENABLED+FORCED; «enforcement» проверяет только роль

**Severity: HIGH** • `packages/db/src/preflight.ts:58-88`

`packages/db/CLAUDE.md` утверждает «`assertNoRlsBypass` обеспечивает это при boot», но функция проверяет только `pg_roles.rolsuper/rolbypassrls` для роли соединения — никогда не смотрит `pg_class.relrowsecurity/relforcerowsecurity` или `pg_policies` по таблицам. Новая tenant-scoped таблица без `ENABLE/FORCE ROW LEVEL SECURITY` (лёгкий пропуск в ручной миграции) пройдёт все проверки и тихо раскроет строки всех арендаторов друг другу. **Фикс:** boot-проверка, выбирающая все таблицы с NOT-NULL `tenant_id` и утверждающая `relrowsecurity AND relforcerowsecurity` + наличие политики; fail-closed; зеркалить как интеграционный тест.

#### HIGH-11. Всё rate-limiting — in-memory per-process, неэффективно на целевой EKS-топологии

**Severity: HIGH** (два ревьюера понизили до MEDIUM: латентно при 1 реплике; manifests — заглушка) → **MEDIUM**. _Привожу здесь как пограничный — см. секцию MEDIUM ниже._

#### HIGH-12. OpenAPI `OrderResponseDto` объявляет `status/total/currency` обязательными, а `POST /v1/orders` возвращает только `orderId+orderNumber`

**Severity: HIGH→MEDIUM** (оба ревьюера понизили: нет эксплуатируемости, сервер не теряет деньги — просто не вычисляет поля; нет живого потребителя сегодня) → **MEDIUM**. _См. секцию MEDIUM._

#### HIGH-13. Невалидируемые UUID path-params в catalog-контроллерах → сырой 500 (Postgres 22P02) вместо 400/404

**Severity: HIGH→MEDIUM** (оба ревьюера понизили: нет breach/денег/privesc, detail уже редактируется; шум доступности/наблюдаемости) → **MEDIUM**. _См. секцию MEDIUM._

---

### 🟡 MEDIUM

- **MEDIUM-1. Ordering-репозиторий обходит обязательный `ScopedTx` (raw `tx.insert/tx.select` на tenant-scoped таблицах).** `apps/api/src/contexts/ordering/infrastructure/order-drizzle.repository.ts:51-104,135-158`. Единственный из четырёх репозиториев, не использующий `scoped.insertInto/selectFrom`. Межарендной утечки нет (RLS держит, предикаты `eq(tenantId)` прописаны вручную), но снят первый из двух рубежей defense-in-depth именно на денежном пути. Будущая ошибка предиката (join/OR/aggregate) не будет поймана на уровне приложения. _Фикс:_ переписать `save`/`loadByIdWithTx`/`findByIdempotencyKey` на `db.withTenant((tx, scoped) => ...)`.

- **MEDIUM-2. `brandId = ctx.brandId ?? ''` — brandless-заказ коэрсится в невалидный UUID и доходит до БД (500 вместо 4xx).** `create-order.service.ts:46`. Fail-closed (строка не коммитится), но опаковый 500 от cast/FK-ошибки вместо «brand required» 4xx; brand-инвариант enforced лишь неявно через БД. _Фикс:_ отклонять явно при `ctx.brandId === undefined` до построения агрегата (как `requireBrandContext()` в каталоге). (Перекрывается с HIGH-6.)

- **MEDIUM-3. GDPR-стирание не покрывает ordering** — см. **BLOCK-2** (в tenancy-измерении оценено как MEDIUM, но профильно эскалировано до BLOCK для compliance-риска).

- **MEDIUM-4. `OrderPaid`/`OrderRefunded` эмитят hardcoded `total:0` и `currency:'USD'`.** `order-drizzle.repository.ts:231-233,249`. Аудит-консьюмер уже пишет неверный payload в `audit_log` для каждого paid-заказа и каждого non-USD арендатора. Данные доступны в snapshot, но отбрасываются. _Фикс:_ протащить `total`/`currency` через `OrderPaidDomainEvent`/`OrderRefundedDomainEvent` из snapshot, убрать литералы.

- **MEDIUM-5. Category-scoped скидки никогда не срабатывают: `categoryId` захардкожен в `''`.** `create-order.service.ts:41` (+ `order-drizzle.repository.ts:177`). `applyDiscount` фильтрует по `l.categoryId === spec.categoryId`, но каждая строка имеет `''` → eligibleSum всегда 0. Тесты проходят, потому что подают `categoryId:'cat-x'` напрямую в domain, минуя service-проводку. _Фикс:_ заполнять `categoryId` из server-resolved item; персистить на `order_items`.

- **MEDIUM-6. Catalog admin/internal READ-эндпоинты scoped по арендатору, но не по бренду — утечка между сиблинг-брендами.** `internal-catalog.controller.ts:65-134`. `listItems/listModifierGroups/listStopList/draft-diff` фильтруют только по tenant; оператор бренда A видит items/modifier-groups/stop-list/черновики бренда B. Нарушает заявленный brand-инвариант. _Фикс:_ требовать brand-контекст и добавить `eq(table.brandId, brandId)` в эти запросы; e2e, что чтения бренда A исключают B.

- **MEDIUM-7. Menu-версия per-tenant, но контент per-brand — cross-brand ETag-churn.** `postgres-menu-version.adapter.ts:11-16`. Публикация бренда A бампает ETag бренда B (лишняя инвалидация edge-кэша); свежесозданный бренд отдаёт ETag «1». `/publish` — единственная мутация без `@RequireBrand`. _Фикс:_ ключевать версию по `(tenant_id, brand_id)` как `catalog_brand_stop_version`; добавить `@RequireBrand` на publish.

- **MEDIUM-8. Catalog create-маршруты требуют `menu:update` вместо `menu:create`.** `catalog.controller.ts:84-159`. Action `create` определён в RBAC, но не требуется ни одним маршрутом; кастомная роль с `menu:['create']` не сможет ничего создать. Невидимо для системных ролей (они дают все 4 действия). _Фикс:_ выровнять guard'ы с действием (POST→`create`, PUT/PATCH→`update`), либо убрать `create` из каталога прав.

- **MEDIUM-9. Нет GET `/v1/orders/:id`; `GetOrderService` и два error-маппинга — мёртвый код.** `orders.controller.ts:18`. `OrderNotFoundError` бросается только в недостижимом сервисе; `DuplicateOrderKeyError` не бросается вообще (`onConflictDoNothing` молча возвращает существующий заказ). Гость не может прочитать свой заказ. _Фикс:_ добавить авторизованный GET с UUID-валидацией и ownership-scoping; убрать/подкрепить dead-маппинги.

- **MEDIUM-10. Несогласованный error-контракт: часть tenancy-конфликтов без machine-readable `code`.** `tenancy/interfaces/http/error-mapping.ts:28`. Шесть конфликтов (`TenantSlugTakenError`, `TenantOffboardingNotAllowedError`, ...) маплены через `new ConflictException(err.message)` (string-форма) → нет `code`, а `type` URI слагифицируется из сообщения (нестабилен, встраивает slug/tenantId). Клиент не может программно различить «slug taken» от «erasure too early». _Фикс:_ перевести все ветки на `{ code, message }`; unit-тест на уникальность `code`.

- **MEDIUM-11. Нет индекса на FK-колонках детей заказа — `GET /orders/:id` секвенс-скан `order_items`/`order_modifiers`.** `migrations/0049_ordering_tables.sql:33-65`. `order_items.order_id` и `order_modifiers.order_item_id` без индекса; каждое чтение заказа — full scan + N+1 по модификаторам. Под пятничный пик — table-wide scans. _Фикс:_ `index(tenantId, orderId)` и `index(tenantId, orderItemId)`.

- **MEDIUM-12. Публичный хот-ридинг меню фильтрует по `brand_id`, но ни один индекс не ведёт с `brand_id` — full tenant-scan на чтение.** `menu.ts:140-145`. Для мультибрендового арендатора планировщик сканирует все items арендатора и фильтрует brand post-condition на самом latency-критичном пути. _Фикс:_ `index(tenantId, brandId, status)`, опционально partial `WHERE status='published'`.

- **MEDIUM-13. Новые tenant-scoped таблицы отсутствуют в каноническом RLS-регресс-наборе.** `tenant-isolation.spec.ts:586-678`. Нет покрытия `payments`, `order_modifiers`, `catalog_menu_version`, `catalog_brand_stop_version` — слепые зоны именно на свежайших таблицах (включая финансовые `payments`). _Фикс:_ добавить cross-tenant SELECT-zero и INSERT-rejected кейсы; лучше — драйвить spec из программного перечисления таблиц с NOT-NULL `tenant_id`.

- **MEDIUM-14. Rate-limiting in-memory per-process (HIGH-11).** `shared/security.ts:142-175` (+ `per-tenant-signin-rate-limit.ts:36`, `brand-slug-rate-limit.guard.ts:22`). На N репликах EKS каждый лимит умножается на N для round-robin-атакующего; brute-force/signup/order-каппы перестают работать кластерно. Латентно при 1 реплике (manifests — заглушка), поэтому MEDIUM, но активируется при первом scale-out. _Фикс:_ бэкенднуть лимитеры общим Redis-стором (atomic INCR+EXPIRE) до горизонтального масштабирования; иначе зафиксировать `replicas=1` как deploy-инвариант с boot-assertion.

- **MEDIUM-15. Один общий per-IP rate-limit-счётчик на все маршруты — per-endpoint каппы кросс-загрязняются.** `shared/security.ts:149-164`. `keyGenerator` по умолчанию (`req.ip`) не переопределён → один 60-сек счётчик на IP на всё приложение. Легитимный гость, листающий меню (max=60), исчерпывает счётчик; его первый sign-in (max=10) отклоняется → self-inflicted DoS на логин. _Фикс:_ `keyGenerator` с route-group-префиксом (internal/signup/reset/signin/public).

- **MEDIUM-16. Публичный order-create без abuse-специфичного лимита/идемпотентности-через-заголовок — только общий per-IP бакет.** `orders.controller.ts:16-30`. `max(req)` не имеет ветки для `/v1/orders` → 60/мин/IP, без per-tenant fairness. (Идемпотентность через body-поле `idempotencyKey` работает корректно — дедуп через `onConflictDoNothing`; но это не блокирует флуд свежими UUID.) _Фикс:_ отдельная, более жёсткая ветка лимита per-tenant+per-IP на общем сторе.

- **MEDIUM-17. Tenant-context middleware доверяет сырому `X-Forwarded-Host` при любом непустом `TRUST_PROXY` (семантика hop/CIDR игнорируется).** `shared/tenant-context.middleware.ts:56-57`. Флаг коэрсится в boolean, `effectiveHost` читает первый (клиентский) сегмент `x-forwarded-host` напрямую, минуя hop-aware `req.hostname`. Поскольку `POST /v1/orders` (`@Public()`+`@RequireActiveTenant()`) берёт tenant/brand из host-bound ALS без ре-валидации, подделанный заголовок (если прошёл ingress) направляет создание заказа в произвольного арендатора/бренд. Не подтверждённый breach сегодня (публичное меню — публичное; ingress должен стрипать заголовок), но хрупкая граница доверия. _Фикс:_ резолвить host через `req.hostname` (учитывает `parseTrustProxy`); валидировать резолвленный host против известных публичных доменных суффиксов.

- **MEDIUM-18. `toMinorUnits` усекает sub-cent, а «per-line rounding»-тест проверяет фикцию.** `ordering/domain/money-utils.ts:5-8`. `frac.padEnd(2,'0').slice(0,2)` усекает, не округляет: `toMinorUnits('0.005')===0`. `Math.round(...)` в агрегате — no-op над уже-целым minor. Тест `order.aggregate.spec.ts:508-557` вычисляет ожидаемое из литералов, не читая вклад модификатора из snapshot — проходит только потому что модификаторы усекаются в 0. Низкий blast-radius сегодня (DTO-regex кэпит ввод 2 знаками), но любая server-computed цена с >2 знаками будет усечена. _Фикс:_ явное округление (`Math.round`) или документировать «только 2 знака» и ассертить; переписать spec на чтение из snapshot.

- **MEDIUM-19/20. OpenAPI-контракт ответа заказа врёт (HIGH-12) и невалидные UUID → 500 (HIGH-13).** Понижены обоими верификаторами до MEDIUM. `orders.controller.ts:25` / `catalog.controller.ts:180,232,241` + `internal-catalog.controller.ts:108,124`. Первое — codegen-потребитель прочитает `undefined` для `total/status`; нет живого потребителя сегодня. Второе — `:id`/`:itemId` уходят сырыми строками в uuid-WHERE → `22P02` → опаковый 500 + error-лог + on-call alert. _Фикс:_ (а) вернуть полный `OrderResponse` или сузить схему/аннотацию до 2 полей и переэмитить openapi.yaml; (б) валидировать path-params на границе (как `parseTenantIdOr404` в tenancy) во всех `:id`-маршрутах catalog.

---

### ⚪ LOW (кратко)

- **LOW-1.** `order_modifiers` без `(id, tenant_id)` unique-якоря и `modifier_group_id` без FK — латентно (лист-таблица сегодня). `ordering.ts:99-123`.
- **LOW-2.** `DuplicateOrderKeyError` — мёртвый код; идемпотентный ре-сабмит молча возвращает 201 с лишним чтением; на гонке re-read=null падает на in-memory id несуществующей строки. `order-drizzle.repository.ts:74-77`.
- **LOW-3.** Нет optimistic concurrency на мутации заказа (нет version-колонки); при подключении lifecycle — lost updates (webhook markPaid vs operator cancel). `ordering.ts:18-68`.
- **LOW-4.** `OrderStatusChanged 'failed'` кодирует reason внутри `newStatus` (`'failed:'+reason`) — ломает status-enum контракт. `order.aggregate.ts:298-312`.
- **LOW-5.** Outbox без claim-state индекса для reclaim-предиката — деградация под backlog брокера. `schema/outbox.ts:74-81`.
- **LOW-6.** Идемпотентность заказа в body-поле вместо стандартного `Idempotency-Key` header; не задокументирован. `dto.ts:31`.
- **LOW-7.** Ordering HTTP-контракт не тестируется без Docker (`describe.skip`); рефайнменты DTO/response-shape не покрыты. `test/integration/create-order-idempotency.spec.ts:17`.
- **LOW-8.** Timing-сравнение tenant-slug-заголовка в middleware утекает длину токена (ранний length-mismatch return) — drift от hardened `InternalTokenGuard`. `tenant-context.middleware.ts:133-140`.
- **LOW-9.** `audit-fks` не видит composite-FK-нарушения, где `tenant_id` родителя nullable; аудитит существующие FK, а не требуемые. `cli/audit-fks.ts:20-47`.
- **LOW-10.** `menu_item_sizes` «один default на item» partial-unique без `tenant_id` в ключе — отклонение от «индекс ведёт с tenant_id». `schema/menu.ts:195-197`.
- **LOW-11.** Slug-alias 301-таблица пишется, но публичное чтение её не консультирует — мёртвые данные, SEO-301 не работает. `public-menu.controller.ts:185-209`.
- **LOW-12.** Admin item-listing грузит все строки и пагинирует в памяти (`rows.slice`) — full scan на каждую страницу. `catalog-drizzle.repository.ts:960-967`.
- **LOW-13.** Публичный menu-документ экспонирует все modifier-groups бренда, даже не referenced опубликованными items + internal-поля. `catalog-drizzle.repository.ts:132-218`.
- **LOW-14.** CSP отключён на API и Swagger `/docs` (HTML-surface без CSP). `shared/security.ts:119-125`.
- **LOW-15.** Per-email/brand-slug rate-limit ключи не валидируются по форме/длине как per-tenant — LRU-eviction можно weaponize, чтобы сбросить счётчик жертвы. `shared/security.ts:43-47`.
- **LOW-16.** Currency-mismatch бросает `UnprocessableEntityException` из application-слоя (HTTP в use-case) вместо domain-error. `create-order.service.ts:16-24`.
- **LOW-17.** Per-option Syrve-инварианты (defaultAmount в [min,max], freeAmount ≤ max) не enforced в Zod. `catalog/application/dto.ts:97-114`.
- **INFO.** `brand.aggregate.ts` — только snapshot-интерфейс, не агрегат (расходится с CLAUDE.md); BA cookie SameSite/secure на дефолтах фреймворка; `photo-upload-url`/`publish` без `@RequireBrand` (намеренно, но недокументировано).

---

## 4. Что НЕ покрыто (completeness-критика)

Как финальный критик, отмечаю пробелы, которые 10 ревьюеров недопокрыли против полноценного современного SaaS-ревью:

1. **Платёжный поток как таковой не ревьюился — потому что его нет.** Все «payment»-находки констатируют отсутствие. Но как только Stripe Connect подключат, нужен отдельный pass: верификация подписи вебхука (`Stripe-Signature` + tolerance window), идемпотентность по Stripe event-id (не только по нашему order-id), обработка `charge.dispute`/`refund.updated`, payout-reconciliation, обработка частичных возвратов, и проверка что `application_fee`/`transfer_data` считаются server-side. Сейчас это слепая зона по определению.

2. **Контекст identity / Better Auth почти не покрыт по существу.** Кроме prod-guardrail-секретов и rate-limit, никто не проверил: 2FA/TOTP-флоу (replay, backup-codes, rate-limit на verify), session-fixation при cross-subdomain cookie, инвалидацию сессий при смене пароля/erasure, bearer-token TTL/rotation, и логику `AuthGuard.tenant_mismatch` cross-check (на неё опираются несколько митигаций — HIGH-7, MEDIUM-17 — но сам guard не верифицирован adversarially).

3. **Web-слой (`apps/admin`, `apps/qr-menu`) полностью вне ревью.** `apps/CLAUDE.md` перечисляет конкретные классы дефектов (open-redirect через `next=`, `secure`-cookie, `NEXT_PUBLIC_*`/`VITE_*` fallback'ы кросс-арендующие клиентов, source-maps в проде, CSP на CDN). Ни один не проверен в этом проходе. Для «гости размещают заказы через web» это критичная поверхность.

4. **NATS JetStream надёжность — только частично.** Outbox/inbox-дедуп подтверждены солидными, но не покрыты: poison-message/DLQ-обработка, max-deliver/backoff политики consumer'ов, поведение при дубле доставки на consumer-краше между inbox-маркером и side-effect-коммитом (заявлено «same tx» — но это не верифицировано на реальном consumer'е), и ordering-tolerance (события `order_created` → `order_paid` без гарантии порядка).

5. **Конкурентность и гонки на денежном пути.** LOW-3 отмечает отсутствие optimistic concurrency, но шире не исследованы: гонка двух создателей с одинаковым idempotencyKey (LOW-2 намекает на null-fallback), гонка stop-list-изменения vs in-flight заказа, и atomicity `save()` + outbox-append (подтверждено что в одной транзакции, но без нагрузочного теста на SKIP LOCKED contention).

6. **Наблюдаемость/алертинг как security-control.** Несколько находок «500 вместо 4xx» поднимают on-call alerts — но никто не оценил, есть ли вообще rate-limit на сами логи/алерты (log-flooding как DoS-вектор на бюджет наблюдаемости), и нет проверки что `correlationId` действительно сквозной через outbox→consumer.

7. **Multi-currency корректность end-to-end.** MEDIUM-4/MEDIUM-18 касаются денег, но не проверено: валидация что currency заказа совпадает с currency бренда/локации (а не берётся из первого item клиента — `create-order.service.ts:16` берёт `input.items[0].currency`), и округление при cross-currency скидках.

---

## 5. Рекомендованный порядок исправления (для solo-founder)

**Перед любым приёмом денег (блокеры MVP-1):**

1. **BLOCK-1 (ценовая авторизация)** — это корень: один catalog-lookup в `CreateOrderService` закрывает разом BLOCK-1, HIGH-2, HIGH-3, HIGH-5, HIGH-6, MEDIUM-5 (categoryId оттуда же). Самая высокая отдача на единицу работы. Сделать первым.
2. **BLOCK-4 (guardrail-секреты)** — маленький фикс, катастрофический риск (обход аутентификации всех арендаторов). Добавить `BETTER_AUTH_SECRET` в guarded-набор, согласовать salt-литерал, вывести из одного источника с `.env.example`.
3. **HIGH-1 + HIGH-9 (FK и payments-unique)** — добавить composite FK на `order_items`/`order_modifiers` и unique на `provider_payment_id` **до** того, как появятся реальные заказы/платежи: ограничение должно предшествовать данным.
4. **BLOCK-2 (GDPR ordering-erase)** — обязательно до EU-клиентов; одна миграция + тест.
5. **HIGH-4 (modifier amount)** — однострочный фикс математики (`* m.amount`) + тест; прямая недозарядка.

**До горизонтального масштаба / production-hardening:**

6. **HIGH-10 + MEDIUM-13 (RLS boot-assertion + регресс-набор)** — автоматический свидетель «double-enforced isolation», которого сейчас нет.
7. **HIGH-8 + MEDIUM-7 (menu-ETag bump + per-brand версия)** — stale-меню = заказ снятых позиций.
8. **HIGH-7 (internal-token RBAC)** — вынести lifecycle/bootstrap за реальную аутентификацию или сетево изолировать.
9. **MEDIUM-6 (catalog admin brand-scoping)** — закрыть cross-brand чтение черновиков/цен.
10. **MEDIUM-14/15/16 (distributed rate-limit + per-route ключи)** — перед первым scale-out; иначе зафиксировать `replicas=1`.

**Когда дойдёт до lifecycle/оплаты (BLOCK-3):**

11. Реализовать payment-capture + status-маршруты + `GET /v1/orders/:id` (MEDIUM-9) + optimistic concurrency (LOW-3) + Idempotency-Key header (LOW-6) как единый кусок — и провести **отдельный** Stripe-ревью (см. пробел №1).

**Параллельно (дёшево, чистят контракт):** MEDIUM-1 (ScopedTx в ordering), MEDIUM-2/MEDIUM-10 (чистые 4xx с `code`), MEDIUM-4/MEDIUM-18 (корректные event-amounts и round-policy), MEDIUM-11/MEDIUM-12 (индексы). LOW — по мере касания файлов.

**Честный вывод:** фундамент (изоляция, RLS, каталог, OpenAPI-дисциплина) — на уровне зрелого SaaS и заметно выше среднего для solo-проекта. Весь риск сконцентрирован в свежем `ordering`-контексте и двух конфиг-дырах. Это не «переписать всё» — это «один catalog-lookup + горстка ограничений БД + два секрет-гварда» закрывают почти все блокеры. Пока они открыты — реальные деньги на платформу пускать нельзя.
