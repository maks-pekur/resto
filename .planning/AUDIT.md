# Аудит фундамента RestOS: мультитенантность, мультибренд, identity

> Глубокий мульти-агентный аудит, 2026-06-13. 50 агентов, 36 находок → **28 подтверждено, 8 опровергнуто**. Severity: 0 BLOCK, 5 HIGH, 11 MEDIUM, 12 LOW.

## Резюме

Фундамент тенант-изоляции (ScopedTx + Postgres RLS + boot-preflight) спроектирован грамотно и держит главную инвариантность: **ни одна из 28 находок не пробивает границу между тенантами** — двойное усиление работает, и строить SaaS на этом ядре безопасно. Реальные проблемы лежат уровнем ниже — в измерении **бренда**: бренд заявлен как изоляционная размерность (read-путь фильтрует по `brand_id`, есть `member_brand_scope`, `brand_domains`), но write-путь, uniqueness, FK и guard'ы бренд не контролируют — поэтому внутри одного тенанта оператор бренда A может править/архивировать/перезаписывать сущности бренда B. Второй системный провал — **RBAC полностью обходится** для всех мутаций меню: они идут через `@Public` + `INTERNAL_API_TOKEN`, минуя `PermissionsGuard`/`BrandScopeGuard`, так что роль `staff` (read-only по дизайну) может публиковать меню. Третий блок риска — **сигнал тестов**: весь регрессионный набор по изоляции тихо «зеленеет» при отсутствии Docker, а `db:audit-fks` структурно слеп к недостающим FK. **Чинить первым** нужно RBAC-обход на catalog-мутациях (HIGH, security) — это единственный сегодня эксплуатируемый путь эскалации привилегий внутри тенанта и прямой блокер для «можем брать деньги с клиента».

## Светофор по областям

| Область            | Статус            | Обоснование                                                                                                                                   |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Мультитенантность  | 🟢 ок             | ScopedTx + FORCE RLS + GUC-lock + preflight держат границу тенанта; ни одна находка её не пробивает.                                          |
| Мультибренд        | 🔴 нужно внимание | Бренд — заявленная изоляция, но не enforced на write/uniqueness/FK/guard: cross-brand правка, перезапись по slug, утечка чужих модификаторов. |
| Identity & RBAC    | 🔴 нужно внимание | Все мутации меню обходят RBAC через `INTERNAL_API_TOKEN`; `staff` может публиковать меню; `@RequireBrand` не висит ни на одном роуте.         |
| Целостность данных | 🟡 нужно внимание | Outbox-порядок не соблюдается, claim-ownership отсутствует, audit-poison дропается без DLQ, slug-race даёт 500.                               |
| Безопасность HTTP  | 🟡 нужно внимание | RES-175 redaction неполная (`title` 5xx не чистится); rate-limit per-process; всё латентно/узко.                                              |
| Тесты              | 🔴 нужно внимание | Весь isolation-набор тихо SKIP при отсутствии Docker; `db:audit-fks` слеп к отсутствующим FK; degraded-mode и brand-scope не покрыты e2e.     |

## Находки по severity

### BLOCK

Подтверждённых BLOCK-находок нет: двойное усиление (ScopedTx + RLS) удержало границу тенанта во всех проверенных векторах. Несколько находок изначально выглядели как BLOCK, но при верификации оказались внутритенантными (cross-brand / RBAC), а не cross-tenant — понижены до HIGH.

### HIGH

**1. Все catalog-мутации идут мимо RBAC через общий `INTERNAL_API_TOKEN`**
`apps/admin/lib/api-server-internal.ts:60-76` + `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts:82-83`
Что не так: контроллер мутаций меню помечен `@Public() @UseGuards(InternalTokenGuard)` — глобальные `AuthGuard`/`PermissionsGuard`/`BrandScopeGuard` короткозамыкаются на `@Public()`, а `InternalTokenGuard` проверяет лишь общий токен. Админка шлёт сюда `x-tenant-id` (из сессии) и `x-brand-slug` (из правимой клиентом cookie). Ни одного per-operator permission-чека на этом пути нет. `SYSTEM_ROLES.staff = { tenant:['read'], brand:['read'] }` — по дизайну ноль прав на меню.
Как ломается: тенант приглашает low-trust пользователя как `staff` (задумано read-only); тот через админку создаёт/правит/архивирует/публикует пункты меню и тогглит стоп-лист — ровно то, что роль должна запрещать. Brand-scope тоже не работает: `x-brand-slug` берётся из cookie, `BrandScopeGuard` не запускается.
Как чинить: либо завести аутентифицированные операторские эндпоинты `/v1/...` с BA-сессией, `@Permissions(...)` + `@RequireBrand()` и звать их из админки вместо `apiFetchInternal`; либо до этого энфорсить `baseRole`/permission в server actions перед internal-вызовом и валидировать `x-brand-slug` против `member_brand_scope`. (Внутритенантный, не cross-tenant — RLS+ScopedTx удерживают границу тенанта.)

**2. Admin-мутации каталога правят по `(id, tenant_id)` — без проверки владения брендом**
`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts:360`
Что не так: все catalog-таблицы несут реальный `brand_id`, и read-путь фильтрует по бренду, но все mutation-пути таргетят строки по `id` + tenant и никогда не сверяют `brand_id` цели с активным брендом оператора (ALS `getBrandId()`). `upsertItem` (update-ветка `eq(menuItems.id, input.id)`), `archiveItem` (`:1086`), `archiveCategory`, `removeFromStopList`, `applyCategoryMoves` — все по `id`. ScopedTx добавляет только `tenant_id`, RLS `menu_items_iso` тоже только `tenant_id`.
Как ломается: оператор под брендом A отправляет `POST /internal/v1/catalog/items` с `id` пункта бренда B (тот же тенант) — update-ветка матчит по `id`+tenant, перезаписывает строку B, в т.ч. перештампует `brandId: input.brandId ?? null` на A, угоняя пункт из бренда B.
Как чинить: протащить ALS `brandId` в каждую catalog-мутацию и добавить `eq(table.brandId, brandId)` (или guard-select по существующей строке) в предикаты update/archive/delete для brand-owned строк, возвращая `MenuItemNotFound` при несовпадении бренда; явно обрабатывать null-brand (tenant-shared) строки. Зеркалировать защиту на уровне БД.

**3. Уникальность slug меню — tenant-wide, не brand-scoped: cross-brand upsert перезаписывает чужую строку**
`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts:421-447` (item), `:296-307` (category); `packages/db/src/schema/menu.ts:117`, `:54`
Что не так: `ON CONFLICT` таргеты брендо-слепы — `menu_items_tenant_slug_uq = (tenant_id, slug)`, `menu_categories_tenant_slug_uq = (tenant_id, slug)`. `upsertItem` делает `onConflictDoUpdate({ target:[tenantId, slug] })`, а `set` включает `brandId: input.brandId ?? null`. Если бренды A и B (один тенант) оба имеют slug `burger`, создание у B не вставляет новую строку, а UPDATE'ит строку A, перезаписывая name/price/photos и переназначая `brandId` на B. A молча теряет пункт.
Как ломается: холдинг с двумя брендами; оператор B создаёт категорию/пункт с slug, уже занятым A (`drinks`, `desserts`, `menu`) — upsert мутирует строку A и флипает `brand_id` на B; ошибки не возвращается, при следующем publish гости A пункт не видят. RLS не ловит — `tenant_id` совпадает.
Как чинить: до запуска мультибренда сделать uniqueness brand-aware: индекс `(tenant_id, brand_id, slug)` (NULLS NOT DISTINCT или generated non-null brand-key для legacy no-brand) и поправить все `ON CONFLICT` таргеты. До этого — `brand_id` косметический, документировать «один бренд на тенант».

**4. Outbox-диспетчер публикует события в произвольном порядке, не по `occurred_at`**
`packages/events/src/outbox/repository.ts:96-102`
Что не так: `claimOutboxBatch` применяет `orderBy(asc(occurredAt))` на подзапросе-кандидате (`:92`), но публикуются строки из внешнего `UPDATE ... RETURNING` (`:96-102`), а его порядок Postgres не гарантирует. `claimed.map(...)` (`:102`) сохраняет RETURNING-порядок без ре-сортировки; диспетчер публикует в нём (`dispatcher.ts:85`). Package CLAUDE.md прямо требует ре-сортировку по `occurred_at` — инвариант задокументирован, но не реализован.
Как ломается: два события одного агрегата в одном батче (`signed_in` затем `signed_out`, `tenant_suspended` затем `tenant_resumed`) уходят в NATS в обратном порядке; last-write-wins консьюмер или audit-таймлайн фиксируют неверное терминальное состояние.
Как чинить: ре-сортировать `claimed` по `occurredAt` после `UPDATE ... RETURNING` и до возврата: `return [...claimed].sort((a,b)=>a.occurredAt.getTime()-b.occurredAt.getTime()).map(...)`. Добавить roundtrip-тест на порядок публикации.

**5. Весь регрессионный набор cross-tenant изоляции тихо SKIP'ается (зелёный) при отсутствии Docker**
`packages/db/test/setup.ts:72-79` (`isDockerAvailable`); ~52 спеки, напр. `tenant-isolation.spec.ts`, `cross-tenant-isolation.e2e.spec.ts`, `cross-tenant-als-leak.e2e.spec.ts`, `concurrent-write-race.spec.ts`, `raw-tx-rls-fence.spec.ts`
Что не так: каждая isolation-спека гейтится `const suite = dockerOk ? describe : describe.skip;`. При падении `docker info` сьют заменяется на `describe.skip` — файл репортится как PASSING с 0 ассертов. ~52 файла (весь RLS/ScopedTx/ALS-leak/concurrent-write/raw-tx/composite-FK/brand-isolation net) зависят от testcontainers. Нет ни одного counter-assert, что сьюты реально выполнились; нет Postgres `services:` в CI.
Как ломается: регрессия, дропающая RLS-политику или ломающая авто-фильтр ScopedTx, мёрджится зелёной на любой машине без Docker (локальный `pnpm test`, миграция runner-образа, сбой pull testcontainers, флапающий демон) — защита есть, но её исполнение не гарантировано.
Как чинить: добавить CI-floor, падающий при skip: `RESTO_REQUIRE_DOCKER=1` в ci.yml + `throw` (не skip) в shared setup при отсутствии Docker; или мета-тест на >0 выполненных тестов; минимум — поднять Postgres как декларированный CI `services:` контейнер. Сделать `describe.skip` невозможным в CI.

### MEDIUM

**6. `revokeAllForTenant` удаляет сессии глобально по `userId` — multi-org пользователь теряет все сессии при архивации одного тенанта**
`apps/api/src/contexts/identity/application/revoke-user-sessions.service.ts:20-23`
Что не так: чтение `member.userId WHERE organizationId = tenantId` корректно scoped, но DELETE по `inArray(session.userId, userIds)` без org-квалификатора. BA допускает членство в нескольких организациях (нет `UNIQUE(userId)`); архивация тенанта A разлогинивает пользователя и из тенанта B. Не cross-tenant эксплойт — единственный вызыватель `ArchiveTenantService` за `InternalTokenGuard`. Это availability/correctness-дефект, не confidentiality.
Как чинить: квалифицировать DELETE по `session.activeOrganizationId = tenantId` (или per-(userId, org)); добавить тест на multi-org пользователя. Сперва подтвердить инвариант 1 user : 1 tenant — если он строгий, дефект инертен.

**7. Публичное меню утекает чужие модификаторы/опции через тенант**
`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts:121`
Что не так: `loadPublishedMenu` brand-фильтрует категории и items, но `menuModifierGroups` (`:124`) и `menuModifierOptions` (`:130-136`) читаются tenant-wide без brand-предиката, хотя несут `brand_id`. Топ-уровневый `PublishedMenu.modifierGroups` строится из всех строк — публичный JSON содержит модификаторы и цены опций сиблинг-брендов. (Под-claim'ы про sizes/stop-list/`findPublishedItem` при верификации оказались over-fetch без утечки в payload, т.к. ключи по `menuItemId`/UUID не коллизируют.)
Как ломается: гость на `brand-a.menu.resto.app` получает в меню модификаторы и ценообразование бренда B. Cross-brand утечка публичных бизнес-данных внутри тенанта.
Как чинить: применить тот же `brandId ? eq(table.brandId, brandId) : undefined` к modifierGroups/modifierOptions в `loadPublishedMenu`; решить и задокументировать обработку null-brand shared строк.

**8. Публичный `/v1/menu` смешивает items/categories всех брендов, когда бренд не разрешён (legacy tenant-only host)**
`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts:84-117`, `:225-244`
Что не так: brand-фильтр применяется только при truthy `brandId`. На tenant-only host (`brandId = null`) публичное меню возвращает items/categories всех брендов тенанта одним документом с `brand=null` — для мультибренд-тенанта несвязный merged-меню (items ссылаются на категории чужого бренда). Не утечка между тенантами (RLS держит тенант), а product-correctness.
Как чинить: определить контракт для `brandId=null` на мультибренд-тенанте — либо 404/требовать бренд, либо scope к дефолтному бренду. Не молча юнионить все бренды.

**9. Инвалидация кэша стоп-листа чистит только ключ резолвящегося бренда — у других брендов остаётся stale overlay**
`apps/api/src/contexts/catalog/application/stop-list.service.ts:72-73`, `:104-105`; `infrastructure/redis-catalog-cache.adapter.ts:11-13`
Что не так: версия меню per-tenant (`VERSION_KEY` только tenant), но кэш per `(tenant, brand, version)`. На stop/unstop инвалидируется ровно один ключ `invalidate(tenantId, current, brandId)`. При этом стоп-overlay читается tenant-wide (`menuStopList` без brand-фильтра, `:115`). Stop под брендом A бастит только ключ A; меню бренда B тоже затронуто overlay'ем, но его ключ не инвалидируется.
Как ломается: гость на сабдомене бренда B продолжает видеть/заказывать стопнутый пункт до истечения TTL (300с). Обратное на unstop. Cache-coherency баг, не tenancy.
Как чинить: инвалидировать все brand-варианты тенанта (enumerate / SCAN по префиксу) либо бампать per-tenant версию на stop-list write; минимум — чистить и null-brand, и resolved-brand ключи.

**10. Race коллизии slug при провижне тенанта даёт сырой 500 вместо 409 — `TenantSlugTakenError` мёртв**
`apps/api/src/contexts/tenancy/application/provision-tenant.service.ts:41-71`
Что не так: неатомарный check-then-insert; `save` использует `onConflictDoUpdate` с таргетом `tenants.id` (новый UUID), а не slug. Два параллельных первичных провижна одного slug оба видят `findBySlug=null`, оба INSERT'ят; `tenants_slug_uq` отклоняет второй сырым `23505`, который не свопается (таргет — `id`) и всплывает как 500 (detail отредачен). `TenantSlugTakenError` (есть маппинг на 409) никогда не бросается — dead code.
Как ломается: два почти одновременных `POST /internal/v1/tenants` с одним slug → один 201, другой опаковый 500 (пейджит on-call как серверная ошибка) вместо понятного 409.
Как чинить: ловить `23505` на `tenants_slug_uq` и перебрасывать `TenantSlugTakenError`, либо `onConflictDoNothing` по slug + re-read. Тест на два параллельных провижна (один 201, один 409).

**11. `releaseOutboxClaim`/`markOutboxDelivered` без предиката владения claim'ом (lost-update окно)**
`packages/events/src/outbox/repository.ts:111-129`
Что не так: оба скоупят только по `id`, не по владельцу claim'а; в схеме нет `claim_id`. Если диспетчер A заклеймил, завис, B переклеймил и публикует, а поздний publish A падает и зовёт `releaseOutboxClaim` — он чистит активный claim B (`claimed_at=NULL`), строка становится переклеймимой → double-publish. CLAUDE.md явно требует claim-ownership предикат. Single-leader через advisory lock делает это не steady-state (потому MEDIUM), но окно failover воссоздаёт гонку.
Как чинить: добавить `claim_id uuid` (или захватывать `claimed_at` и `AND claimed_at = $captured`) в WHERE обоих запросов; `claimOutboxBatch` выставляет/возвращает claim-эпоху per row.

**12. Audit-сабскрайбер без DLQ-publisher и без db-хэндла — poison audit-события молча дропаются**
`apps/api/src/contexts/audit/infrastructure/nats-audit-subscriber.ts:49-54`
Что не так: `subscribe({...})` без `dlqPublisher`/`maxDeliver`/`ackWaitMs`; `NatsModule` коннектит subscriber без `db`. В `#routeToDlq` оба guard'а (`if (this.#dlqPublisher)`, `if (this.#db)`) отваливаются: poison-байты не реплеятся в `dlq.<subject>`, alert `identity.email_dispatch_failed.v1` не эмитится. После `DEFAULT_MAX_DELIVER=5` сообщение ACK'ается и теряется — для audit-пайплайна (GDPR PII-trail) это дыра в комплаенс-логе без DLQ и без пейджа. Нарушает явное правило package CLAUDE.md.
Как ломается: БД недоступна ~2.5 мин (5×30с ack_wait) при деплое/инциденте — audit-консьюмер исчерпывает max_deliver, ACK'ает и дропает событие; ни строки `audit_log`, ни DLQ-копии, ни алерта.
Как чинить: передать `db` в `NatsJetStreamSubscriber.connect` и `dlqPublisher` в audit `subscribe()`; либо резко поднять `maxDeliver` для audit и различать transient (БД упала → NAK) vs permanent (нераспарсиваемое → DLQ).

**13. `brand_id` на всех menu-таблицах + `customer_profiles` не имеет FK на `brands` (нарушение composite-FK инварианта ADR-0020 I-2)**
`packages/db/src/schema/menu.ts:33,78,143,175,203,236,272`; `customer-profiles.ts:18`; `migrations/0018_dazzling_sir_ram.sql`
Что не так: миграция 0018 добавила nullable `brand_id` без `.references()` и без `compositeTenantFk()`. Бренд — intra-tenant родитель в иерархии, I-2 требует `FOREIGN KEY (brand_id, tenant_id) REFERENCES brands(id, tenant_id)`. Helper существует и применён к `brand_domains`/`member_brand_scope`, но опущен здесь — `brand_id` неограниченная колонка. Тенант-граница НЕ пробивается (RLS+`tenant_fk` держат тенант); риск — внутритенантный referential drift (import/seed/баг проштампует несуществующий/чужой-но-того-же-тенанта `brand_id`, Postgres примет) и dangling после hard-delete бренда.
Как чинить: добавить `compositeTenantFk()` на `brand_id` всех menu-таблиц + `customer_profiles` (после бэкфилла non-null), MATCH SIMPLE даёт enforcement только на non-null. `outbox_events.brand_id` можно оставить без FK.

**14. `db:audit-fks` не детектит отсутствующий FK — только wrong-arity, поэтому brand_id-дыра невидима собственному guardrail'у проекта**
`packages/db/src/cli/audit-fks.ts:27-48`; `packages/db/test/integration/audit-fks.spec.ts:36-38`
Что не так: `runAudit()` строит `fk_summary` из `pg_constraint WHERE contype='f'` и флагует `cardinality(conkey)=1`. Колонка БЕЗ FK (ровно `brand_id` на menu-таблицах) даёт ноль строк и не репортится — аудит видит «FK должен быть composite», но слеп к «FK вообще отсутствует». Happy-path тест `expect(violations).toEqual([])` ПРОХОДИТ при наличии дыры.
Как чинить: вторым запросом перечислять ожидаемые child→parent пары из реестра в схеме (включая `brand_id`) и ассертить наличие composite FK; репортить отсутствие как violation. Добавить `brand_id` в `composite-tenant-fk.spec.ts`.

**15. Multibrand write-scope (`@RequireBrand`/`BrandScopeGuard`) не висит ни на одном роуте — проверяется только мок-юнит-тестами**
`apps/api/src/contexts/identity/interfaces/http/decorators/require-brand.decorator.ts:12`; `brand-scope.guard.ts:33`; `identity-http.module.ts:52`
Что не так: `BrandScopeGuard` зарегистрирован глобально, но `@RequireBrand` не применён нигде в `apps/api/src` — guard упирается в первую ветку «`@RequireBrand` отсутствует → pass» на 100% запросов. `member_brand_scope` только читается, никогда не пишется приложением — фича half-built. Нет ни одного e2e-теста, где brand-scoped оператор получает 403 на out-of-scope мутацию. Сегодня blast radius ноль, потому MEDIUM.
Как чинить: добавить guard-coverage тест (хотя бы один реальный роут несёт `@RequireBrand`, scoped-оператор HTTP-denied 403 на out-of-scope бренде) или явно задокументировать guard как dormant pre-build с failing/pending тестом. Повесить `@RequireBrand` на первый же multibrand write-роут.

**16. Allowlist `withoutTenant` только parity-тестируется (ESLint ↔ TS const), не enforced в рантайме**
`packages/db/test/unit/withoutTenant-allowlist.spec.ts:54-66`; `packages/db/src/withoutTenant.allowlist.ts`; preflight `assertWithoutTenantCallsiteRegistered` (presence-only)
Что не так: `withoutTenant` биндит `app.is_system=true` — полный cross-tenant bypass RLS. Тест проверяет лишь, что TS-const равен union'у `files:` литералов из eslint-конфигов; он НЕ грепит реальные call-site'ы. Preflight только presence-чекает существование перечисленных файлов, не инвертирует проверку. Разработчик с `// eslint-disable-next-line` достигает bypass без сигнала теста/preflight. (Сегодня все 11 callers в allowlist — живого эксплойта нет, латентная дыра governance.)
Как чинить: тест/AST-шаг, перечисляющий каждый `.withoutTenant(` call-site в `apps/api/src` + `packages/**` и ассертящий, что файл в `WITHOUT_TENANT_ALLOWLIST`, с падением на неучтённого вызывателя.

### LOW

**17. `@RequireBrand` никогда не применён — `BrandScopeGuard` и `member_brand_scope` RBAC инертны**
`apps/api/src/contexts/identity/interfaces/http/guards/brand-scope.guard.ts:44`
Что не так: тот же дефект, что #15, под углом RBAC: `if (!required) return true;` срабатывает на 100% запросов. Однако BLOCK-эксплойт нереализуем — нет операторского эндпоинта, где можно читать/мутировать данные бренда B (catalog-роуты `@Public`; `GET /v1/me/brands` сам энфорсит `member_brand_scope` внутри `ListMyBrandsService`). Латентный pre-emptive дефект, не текущий cross-brand breach.
Как чинить: вешать `@RequireBrand` на каждый brand-scoped операторский роут по мере появления; guard-coverage тест против тихой регрессии.

**18. Динамические custom-роли (если включат) дали бы тенанту привилегии сверх собственных — нет subset-чека**
`apps/api/src/contexts/identity/infrastructure/better-auth/auth.config.ts:202-205`
Что не так: `dynamicAccessControl: { enabled: true }`; BA `createRole` не проверяет, что запрошенный permission-set ⊆ прав создателя. Сейчас недостижимо (createRole требует `ac:['create']`, которого нет ни у одной роли RestOS — dynamic AC фактически мёртв). Риск чисто латентный.
Как чинить: до включения tenant-defined ролей добавить app-guard на subset прав создателя и явно исключить `tenant:delete`/`tenant:transfer`/`staff:remove` из tenant-assignable ролей; regression-тест.

**19. `upsertModifierGroup` update-ветка молча дропает переназначение `brandId` (асимметрия write)**
`apps/api/src/contexts/catalog/infrastructure/catalog-drizzle.repository.ts:467-498`
Что не так: insert пишет `brandId` (`:488`), update-ветка (`:470-482`) — нет; items/categories в update включают `brandId`, modifier groups нет. Бренд modifier-группы set-once-at-insert, расходится с конвенцией. Только внутритенантная несогласованность.
Как чинить: либо включить `brandId: input.brandId ?? null` в update-set для паритета, либо сделать `brandId` иммутабельным для всех сущностей и задокументировать. Одна конвенция на item/category/modifier-group/option.

**20. Сбой `presignGet` отдаёт `imageUrl/url = ''` (битый URL) вместо `null`; выход не валидируется схемой**
`apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts:33-44`; repository `:153`, `:262`; `public-menu.controller.ts:33,44`
Что не так: `presignGet` возвращает `''` при ошибке S3 (degraded-mode). `imageUrl: photos[0]?.url ?? null` — `?? null` не конвертит `''` в null, поэтому `imageUrl` уходит `''`. DTO декларирует `.url()`, но ZodSerializer/response-валидации нет — битая пустая строка уходит клиенту. Не security; на хиккапе S3 рендерятся битые `<img src=''>` вместо graceful null.
Как чинить: в `signPhotos`/`loadPublishedMenu` коэрсить пустой presign в null (дропать url фото); опционально response-serializer для валидации DTO в non-prod.

**21. Суспенд-tenant read-enforcement узкий и размазан по двум guard'ам; не-suspended нестатусы держатся на side-channel `archivedAt`**
`apps/api/src/shared/auth/require-active-tenant.guard.ts:13-28`
Что не так: `RequireActiveTenantGuard` блокирует только `status === 'suspended'` (`:21`), игнорируя `archived`/`pending_offboarding`/`erased`. Их ловит отдельно `AuthGuard` по `archivedAt` (`auth.guard.ts:57`, до `@Public`-короткозамыкания). Сегодня покрытие полное, но correct-by-accident: новый статус, не выставляющий `archivedAt`, тихо продолжит отдавать публичное меню. Живой утечки нет.
Как чинить: заменить два литеральных чека единым доменным предикатом `TenantStatus` (`SERVABLE_STATUSES` / `Tenant.isPubliclyServable()`); regression-тест, пиннящий блок каждого нестатуса на `GET /v1/menu`.

**22. `ProblemDetailsFilter` редачит `detail` на 5xx, но оставляет `title` (=message) нередаченным**
`apps/api/src/shared/exception.filter.ts:51-53,96-101`
Что не так: RES-175 редачит только `detail`; для `HttpException` `title = exception.message` (`:53`) и никогда не чистится даже при `status >= 500`. 5xx HttpException с чувствительным message отдаёт сырой message в `title`. Живой путь есть: `error-mapping.ts:38` мапит `BetterAuthBootstrapFailureError` в `BadGatewayException({ message: err.message })` (502), где `err.message` несёт сырой Better Auth cause — попадает в `title`. Путь за `INTERNAL_API_TOKEN`, контент — контролируемая stage-строка, потому LOW.
Как чинить: при `isServerError` коэрсить `title` в дженерик-имя статуса (`'Internal Server Error'`), чтобы редакция была полной независимо от способа конструирования 5xx.

**23. Логгер-redaction, заявленный в доках как существующий, полностью отсутствует в `packages/db/src/logger.ts`**
`packages/db/src/logger.ts:8-12`
Что не так: оба CLAUDE.md утверждают, что `logger.ts` имеет `redact` по `password/token/email/phone/params`. Фактически — `pino({ name, level, base })` без `redact`. App-wide тоже: `main.ts:42` `FastifyAdapter({ logger: false })`. Drizzle query-logging выключен и вообще не подключён, поэтому латентно. Любой будущий ре-enable query-логирования или `logger.log({ user })` с email/phone эмитнет в plaintext.
Как чинить: либо добавить заявленный `redact` в `logger.ts` и подключить redacting-pino как app-логгер через `app.useLogger(...)`, либо поправить оба CLAUDE.md, убрав claim о несуществующем контроле.

**24. CLAUDE.md-нота «identity нарушает correlationId-from-OTel-span» УСТАРЕЛА — нарушения нет**
`apps/api/src/contexts/identity/identity-core.module.ts:268,283,304`; `auth.config.ts:230`; `resend.adapter.ts:370`
Что не так: все emit-сайты строят envelope через `buildEnvelope(...)` без явного correlationId — он деривится из ALS/OTel (`envelope.ts:144`), с D-10 randomUUID-fallback только при отсутствии span'а. Греп `correlationId:` по контексту — 0 hits; единственный `randomUUID()` (`identity-event-emitter.adapter.ts:12`) — для `aggregateId`, не correlationId.
Как чинить: убрать «Note: identity context currently violates this — see CONCERNS.md» из CLAUDE.md или пометить в CONCERNS.md как remediated.

**25. `BrandSlugRateLimitGuard` использует per-process in-memory Map — неэффективен на multi-replica EKS и течёт памятью**
`apps/api/src/contexts/identity/interfaces/http/guards/brand-slug-rate-limit.guard.ts:22-49`
Что не так: buckets в process-local `Map`. При N репликах эффективный лимит cap×N; протухшие buckets чистятся только при повторном хите того же ключа — карта растёт неограниченно (key = `userId` / `ip:`). Защищает ровно один аутентифицированный permission-gated роут `GET /me/brands/slug-availability`, потому LOW.
Как чинить: бэкнуть лимитер Redis (ioredis уже есть) для cross-replica корректности; минимум — периодическая эвикция протухших buckets и документировать как soft per-pod лимит.

**26. Application-сервисы гоняют сырые Drizzle-запросы по BA-таблицам — отклонение от «application зависит только от портов»**
`apps/api/src/contexts/identity/application/signup.service.ts:180-187`; `bootstrap-owner.service.ts:136-152`; `revoke-user-sessions.service.ts:11-25`
Что не так: три application-сервиса импортируют `drizzle-orm` и `@resto/db/schema` и выполняют запросы (включая `.delete(sessionTable)`) через `AUTH_DRIZZLE_TOKEN` — конкретный infra-handle, не порт. Нарушает задокументированное «application depends only on ports / no raw SQL outside packages/db». Не security (resto_auth — легитимный BA-путь, BA-таблицы без RLS by design); deliberate documented compromise.
Как чинить: либо завести тонкий BA-store порт (`BaUserReader`/`BaSessionRevoker`) в `application/ports` и вынести Drizzle в infra-адаптер (как `MemberBrandScopeReader`), либо ADR/CLAUDE.md carve-out, что BA-credential-probes — допустимое исключение.

**27. `RecordAuditService.fromEnvelope` (withTenantId-путь, WR-02) — dead code; audit-записи всегда под `withoutTenant`**
`apps/api/src/contexts/audit/application/record-audit.service.ts:41-54`
Что не так: `fromEnvelope` реализует WR-02 (tenant-bound → `withTenantId`, RLS остаётся scoped), но единственный живой вызыватель — `NatsAuditSubscriber` → `runDeduped(...)` → `fromEnvelopeWithTx(envelope, tx)`, где `tx` всегда system (`withoutTenant`/BYPASSRLS). Греп `.fromEnvelope(` (кроме `WithTx`) — только сайт определения. Каждая audit-строка пишется под `is_system=true`; не isolation breach (RLS INSERT-policy удовлетворена `is_system`, `tenant_id` корректно копируется из envelope), но задокументированная WR-02 «RLS stays scoped» не упражняется, и dead-метод даёт ложное впечатление defense-in-depth.
Как чинить: либо удалить `fromEnvelope`, либо реструктурировать `fromEnvelopeWithTx` так, чтобы audit-insert биндился к тенанту; минимум — задокументировать, что `withTenantId`-путь не используется.

**28. Degraded-mode публичного меню (cold/down Redis) не покрыт тестом no-crash инварианта — покрыт лишь cache MISS, не FAILURE**
`apps/api/test/unit/catalog/get-published-menu.service.spec.ts:64-92`
Что не так: CLAUDE.md требует «public menu reads MUST stay fast on cold Redis ... must not crash». Тест покрывает HIT и MISS (`cache.get` → null), но не FAILURE (`cache.get`/`cache.set` REJECT). Нет ассерта, что бросающий cache-адаптер деградирует к успешному DB-read. Инвариант реализован в адаптере (try/catch на каждой Redis-операции), но сам адаптер имеет ноль тестов, а сервис cache-rejection не ловит. Resilience, не isolation, потому LOW.
Как чинить: добавить тест, где `cache.get` (и отдельно `cache.set`) реджектят, ассертящий, что `service.execute()` резолвится с repo-loaded меню и не бросает.

## Что проверено и оказалось ОК

- **Граница тенанта держится.** ScopedTx авто-инжектит `tenant_id` на INSERT, авто-аппендит `eq(tenant_id)` на SELECT/UPDATE и не имеет `deleteFrom`; рантайм-guard на INSERT ловит протёкший `tenantId`. Ни одна из 28 находок не пробивает cross-tenant границу.
- **Postgres RLS как второй забор.** Каждая tenant-scoped таблица — `ENABLE` + `FORCE RLS` с предикатом `is_system_session() OR tenant_id = current_tenant_id()`; `resto_app` — NOSUPERUSER NOBYPASSRLS без DELETE-гранта (кроме двух bounded таблиц).
- **GUC-lock.** `app.current_tenant` биндится только через SECURITY DEFINER `app_bind_tenant`, прямой `set_config` отозван у PUBLIC, rebind на другой тенант RAISE'ит; drift-sentinel `#assertGucUnchanged` откатывает транзакцию при сдвиге GUC.
- **Boot-preflight fail-closed.** `assertNoRlsBypass`, `assertTenantLockInstalled`, `assertSetConfigRevoked`, `assertNoBaCredentialAccess` валят старт API при дрейфе схемы/ролей.
- **HTTP tenant-claim безопасен.** Клиент влияет на резолв тенанта через Host/headers, но каждый аутентифицированный путь гейтится `AuthGuard` tenant_mismatch cross-check (RES-172) + RLS; `x-tenant-slug`/`x-tenant-id` в prod честны только на `/internal/v1/*` с валидным `INTERNAL_API_TOKEN`.
- **X-Brand-Slug не пересекает тенант.** `resolveBrandBySlug` ре-проверяет `brand.tenantId === tenantId` (RES-173), исключая erased бренды.
- **Composite FK + erase.** Родители несут `UNIQUE(id, tenant_id)`, child'ы — composite FK (там, где FK вообще объявлен); `tenancy_erase_tenant` — SECURITY DEFINER за caller-specific `app.allow_erasure` GUC + соль ≥32 символов.
- **8 находок опровергнуто** при адверсариальной верификации — что подтверждает, что отчёт не раздут ложными тревогами и оставшиеся 28 реальны.
- **identity correlationId** на деле НЕ нарушает OTel-инвариант (нота в доках устарела, см. #24) — реального дефекта там нет.

## Рекомендуемый порядок действий

1. **#22, #24, #23 — доки/однострочники (минимальный blast radius).** Скоэрсить `title` в дженерик на 5xx; убрать устаревшую correlationId-ноту из CLAUDE.md; добавить `redact` в `logger.ts` или поправить доки. Чистые, изолированные, без миграций.
2. **#10 — slug-race → 409.** Ловить `23505` на `tenants_slug_uq`, бросать `TenantSlugTakenError` (маппинг уже есть). Один catch + тест.
3. **#4 — outbox-порядок.** Ре-сортировать `claimed` по `occurredAt` после `RETURNING`. Однострочник + roundtrip-тест; чинит документированный инвариант.
4. **#7, #9, #8 — brand-фильтры на read-пути.** Добавить `brandId ? eq(table.brandId, brandId)` к modifierGroups/options; чинить инвалидацию стоп-листа (все brand-ключи); определить контракт `brandId=null`. Локализовано в `catalog-drizzle.repository.ts` + `stop-list.service.ts`.
5. **#1 — RBAC-обход на catalog-мутациях (САМОЕ ВАЖНОЕ по риску).** Энфорсить `baseRole`/permission в admin server actions перед internal-вызовом и валидировать `x-brand-slug` против `member_brand_scope` как немедленный митигейт; параллельно проектировать аутентифицированные `/v1/...` эндпоинты. Прямой блокер «можем брать деньги».
6. **#2, #3, #19 — brand-aware write-путь.** Протащить ALS `brandId` в catalog-мутации + предикат `eq(brandId)`; сделать uniqueness `(tenant_id, brand_id, slug)`; выровнять `brandId` в update modifier-group. Связка, требующая миграции индексов — делать вместе.
7. **#5, #14, #15/#17, #28 — сигнал тестов.** CI-floor `RESTO_REQUIRE_DOCKER=1` (или Postgres `services:`); второй запрос в `audit-fks` на отсутствующие FK; guard-coverage тест на `@RequireBrand`; degraded-mode cache-FAILURE тест. Гарантируют, что последующие фиксы не регрессируют молча.
8. **#13 — composite FK на `brand_id`.** Бэкфилл `brand_id` non-null → `compositeTenantFk()` на все menu-таблицы + `customer_profiles`. Делать после того, как audit-fks (#14) научится это ловить.
9. **#12, #11, #6 — durability/identity.** Передать `db`+`dlqPublisher` audit-сабскрайберу; добавить `claim_id` в outbox release/mark; квалифицировать session-DELETE по `activeOrganizationId`. Каждое — узкий focused фикс + тест.
10. **#16, #18, #20, #21, #25, #26, #27 — governance/hardening/чистота.** Runtime-enforced `withoutTenant` allowlist; subset-чек перед включением dynamic AC; coerce empty presign → null; единый `SERVABLE_STATUSES` предикат; Redis-backed rate-limit; BA-store порт; удаление/реструктуризация dead `fromEnvelope`. Латентные/дормантные — закрывать по мере касания соответствующих модулей.
