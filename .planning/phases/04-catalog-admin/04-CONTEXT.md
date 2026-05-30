# Phase 4: Catalog Admin - Context

**Gathered:** 2026-05-30
**Status:** Ready for planning

<domain>
## Phase Boundary

**Foundational menu domain redesign + admin CRUD over a new iiko-aligned schema.** Phase 04 owns three layers from the bottom up: (1) catalog schema (DB + Drizzle + DTO), (2) HTTP API surface, (3) `apps/admin` UI. The public `/v1/menu` DTO inherits the new fields by definition (it reads from the same schema). Customer surfaces (`apps/website` Phase 05, `apps/qr-menu` Phase 06) RENDER the new fields — their consumption is downstream phase work, not Phase 04.

**Scope of Phase 04:**

1. **Schema redesign aligned with iiko nomenclature model** (NEW — user intent 2026-05-30): pересмотреть текущий плоский catalog schema под iiko entity shapes (Группа / Блюдо / Модификатор / Группа модификаторов / Размер / Стоп-лист / ТТК-fields), не 1:1, но достаточно близко чтобы MVP-3 iiko-integration adapter был тонким маппингом, не reshape'ом. См. `<schema_redesign_direction>` ниже.
2. **API endpoints** — расширить `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` под новую schema (включая отдельные endpoints для Modifier Groups, Sizes, Stop-list, Draft/Published diff endpoint). Public `/v1/menu` DTO расширяется новыми полями.
3. **Admin UI** — CRUD для всех catalog entities (categories, items, modifiers, modifier groups, sizes, stop-list) с draft/publish flow.

**Out of scope:** `apps/website` рендеринг menu (Phase 05), `apps/qr-menu` polish (Phase 06). Их работа — потребить новый `/v1/menu` DTO.

</domain>

<schema_redesign_direction>

## Schema Redesign — iiko Alignment (NEW в Phase 04)

**Решение пользователя 2026-05-30:** пересобрать catalog schema "полностью пересмотрев номенклатурные группы и поля для всех items" под iiko nomenclature. Это foundational work — все остальные decisions (UI/UX/API) накладываются СВЕРХУ финализированной schema.

**Researcher's mandate (BEFORE producing RESEARCH.md):**

1. **Read iiko nomenclature docs** (canonical: `https://ru.iiko.help/articles/#!api-documentations/elementy-nomenklatury`). Если SPA закрывает контент от non-browser fetcher'ов, использовать open-source SDK как прокси-источник actual field names:
   - `https://github.com/salesduck/iiko-cloud-api` — описывает available methods, request/response bodies
   - `https://github.com/kebrick/pyiikocloudapi` — Python iiko cloud API client
   - `https://github.com/zmiulan/iiko-sdk` — TypeScript/JS SDK
   - `https://github.com/wollzy/iiko-go` — Go iiko package
   - `https://www.postman.com/avatariya/iiko-cloud-api/overview` — Postman collection
2. **Build entity-map document** `04-SCHEMA-MAP.md` (in Phase 04 dir) — таблица iiko entity → RestOS current entity → proposed RestOS entity. Колонки: iiko name, iiko fields (required vs optional, types), current RestOS equivalent (если есть), proposed change.
3. **Open questions to surface in RESEARCH.md:**
   - Категории: hierarchical (parent_id) vs flat? iiko `Группа` — tree. Наш current schema flat. Если иерархия нужна с MVP-1 — миграция сейчас дешевле чем через 6 месяцев.
   - `Размер` (size) — отдельная сущность (как у iiko) или embedded variant внутри item? Trade-off: cleaner re-use across items vs simpler MVP UI.
   - `Группа модификаторов` (modifier group) — current `UpsertModifierInputSchema` имеет min/max selectable что выглядит как ModifierGroup; нужно ли разделить на Modifier + ModifierGroup как у iiko?
   - ТТК (технико-технологическая карта): отдельная сущность с ingredients-list + cost-breakdown vs только nutritional fields на item? MVP-1 пользователь выбрал structured БЖУ — это слой 1; full ТТК откладываем в v2.
   - Стоп-лист с reason: iiko позволяет указать причину 86'd. MVP-1 пользователь выбрал простой on/off без reason; researcher оценит сколько truda добавить reason сейчас vs позже.
4. **Researcher recommends a target schema** в RESEARCH.md (Drizzle table sketches) с rationale для каждого entity. Planner потом разбивает на migration steps + service refactor + DTO updates + admin UI builds.

**Important:** RestOS schema column names МОГУТ оставаться в английском (`menu_item`, `category`, `modifier_group`) пока entity shapes и relationships совпадают с iiko. UI-copy в admin/website может использовать русские термины (Группа, Блюдо, Модификатор) per `<feedback-iiko-catalog-model>` memory.

**Migration risk:** Существующие catalog tables уже имеют данные (даже dev seed). Researcher должен учесть migration path: можно ли сделать reversible migration без data loss? Если нужен breaking change — это OK потому что catalog данных в проде ноль (нет paying customers).

**Tradeoff captured:** Pre-existing UX decisions (D-01..D-13) предполагают модель близкую к плоской с явными Categories/Items/Modifiers/Variants/Stop-list секциями. Если researcher предложит hierarchical Группы (например), это потребует пересмотра D-01 (sidebar) и D-02 (Items table) — категория станет path-breadcrumb'ом. Planner вызывает /gsd:plan-phase с пометкой "schema-may-affect-UI" и пользователь подтверждает финальную UX перед execution.

</schema_redesign_direction>

<decisions>
## Implementation Decisions

### Catalog Information Architecture

- **D-01:** Sidebar admin — пункт `Menu` (expandable group, collapsed by default) с дочерними роутами `Categories`, `Items`, `Modifiers`, `Stop-list`. Один верхне-уровневый пункт, иерархия раскрывается. Sidebar остаётся чистым; полный sub-nav доступен. Никаких top-level Items / Categories / Modifiers строк.
- **D-02:** Default представление `/dashboard/menu/items` — **компактная таблица** с маленьким thumbnail (48px) + name + category + price + status + actions. Header содержит фильтры (Category / Status) + search box. Card grid отвергнут — у заведений с 200+ позициями таблица гораздо быстрее scan.
- **D-03:** Default фильтр Items list — **все статусы кроме `archived`** (draft + published + 86 видны). Archived доступны через явный status-фильтр. Сортировка по `sortOrder` (затем по категории).

### Item Editor UX

- **D-04:** Редактирование позиции — **полноценная страница** `/dashboard/menu/items/[id]` (и `/dashboard/menu/items/new` для создания). Клик по строке в таблице → переход на страницу. Внутри страницы вкладки для variants и modifier-groups. Sheet/modal отвергнут (слишком много полей, deep-link страдает).
- **D-05:** Мультиязычные поля — **MVP-1 редактирует только основной язык tenant'а**. LocalizedText DTO остаётся, но UI пишет в default-locale. Мультиязычные вкладки (RU/EN/...) откладываются в v2 (после первого платящего клиента).
- **D-06:** БЖУ и калорийность — **4 раздельных числовых поля** (proteins, fats, carbs, kcal) **на 100г**. Требует расширения catalog schema + UpsertItemInput DTO. Структурированные значения нужны и для customer surface (фильтры на QR-menu / Site) и для будущей интеграции с iiko ТТК.
- **D-07:** Фото позиции — **одно главное фото** (current `imageS3Key` в schema). Multi-photo gallery откладывается в v2. UX: drag-drop area + click-to-browse fallback, preview thumb после upload, replace через "Change photo" кнопку.

### Draft / Publish Flow

- **D-08:** Сохранение draft — **явный `Save draft` кнопкой** в редакторе позиции/категории. Изменения теряются при уходе со страницы без save. Обязателен unsaved-changes warning (browser beforeunload + Next.js router intercept) при попытке навигации с грязной формой. Auto-save отвергнут (риск случайных правок > удобство).
- **D-09:** Diff "черновик vs опубликовано" (CAT-08) — **status badges per item в таблице** + **sticky publish bar** внизу страницы Items / Categories. Бейджи: `draft` / `modified` (опубликовано, но draft изменён) / `published` / `86'd` / `archived`. Sticky bar показывает "N unpublished changes → Publish". Отдельная страница `/menu/preview` или diff-modal **не делается** в MVP-1. CAT-08 удовлетворяется визуально через badges + bar.
- **D-10:** Publish UX — **инстантный publish + undo-toast (5s)**. Клик `Publish` в sticky bar → немедленная публикация snapshot'а → toast "Published. Undo (5s)". Undo в 5s window откатывает к предыдущей snapshot-версии. Confirm-modal с list-of-changes **не делается** — UX оптимизирован для быстрых правок (типичный flow: правка цены → save → publish). Подразумевает backend-возможность "revert to previous snapshot" в течение 5s.

### Stop-list vs Archive

- **D-11:** **Stop-list ≠ Archive — два разных концепта**:
  - **Stop-list (86'd)** — runtime-state, временное отключение позиции на сегодня без правки draft/published. Публикуется мгновенно (не требует publish-flow). Хранится отдельно (новый stop_list table или nullable `stopped_at` колонка на items).
  - **Archive** — финальное удаление из меню через `status: archived` в draft. Требует publish для применения. Архивные не отображаются на customer surfaces никогда.
- **D-12:** Stop-list toggle — **inline switch в строке Items-таблицы** (`Stop` column) + **виджет `Today's 86` на Dashboard home** с кнопкой `Reset all`. Клик по switch — мгновенный (без confirm), мгновенная публикация. Виджет показывает count + список 86'd позиций.
- **D-13:** Сброс stop-list — **ручной toggle off**. Никакого auto-reset в 03:00. Stop-list персистит через ночь пока оператор сам не снимет. Reason: tz cron-логика лишняя, оператор предпочитает явный контроль (особенно когда дефицит ингредиента длится >1 дня).

### Claude's Discretion

- Конкретный shadcn компонент для status badge (Badge variant variants — `outline` для draft, `default` для published, `destructive` для 86'd, `secondary` для archived).
- Toast library (Sonner уже в shadcn pack — used in admin).
- Sticky bar точное позиционирование (внизу viewport vs sticky bottom of content area).
- Photo upload drag-drop библиотека (react-dropzone vs native HTML5).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### iiko domain model (foundational — read FIRST)

- `https://ru.iiko.help/articles/#!api-documentations/elementy-nomenklatury` — iiko "Элементы номенклатуры" (nomenclature elements). RestOS catalog/menu schema должна быть выровнена с iiko entity shapes (Группа / Блюдо / Размер / Модификатор / Группа модификаторов / Стоп-лист / ТТК) для упрощения MVP-3 интеграции. Researcher: explicitly map iiko entities → RestOS entities в RESEARCH.md, flag divergences.

### Existing project artifacts

- `.planning/REQUIREMENTS.md` §"Catalog Admin (CAT)" — CAT-01..CAT-10 (требования фазы)
- `.planning/ROADMAP.md` §"Phase 4: Catalog Admin" — goal + 5 success criteria
- `.planning/PROJECT.md` §"Catalog (partial)" — что уже сделано на API стороне (Drizzle schema, Redis cache, S3 presigning, `/v1/menu` public reader)
- `.planning/phases/02-admin-shell/02-CONTEXT.md` — admin shell conventions (URL `/login`, signed `resto.active_brand` cookie, `<EmptyState>` component variants, sidebar Dashboard/Brands/Settings)
- `.planning/phases/03-auth-completion/03-VERIFICATION.md` — auth foundations validated

### Codebase entry points

- `apps/api/src/contexts/catalog/` — existing bounded context (domain, application services, Drizzle repository, Redis adapter, S3 adapter, HTTP controllers)
- `apps/api/src/contexts/catalog/application/dto.ts` — current `UpsertCategoryInputSchema` / `UpsertItemInputSchema` / `UpsertModifierInputSchema` (Zod source of truth)
- `apps/api/src/contexts/catalog/interfaces/http/internal-catalog.controller.ts` — current admin endpoints (Post categories/items/modifiers/publish)
- `apps/admin/app/dashboard/(workspace)/` — admin pages structure (Brands, Settings)
- `apps/admin/lib/api-server.ts` — `apiFetch` server-only pattern (Phase 3 hardened with cookie-before-redirect)
- `packages/db/src/schema/` — Drizzle schema; catalog tables live here; БЖУ extension lands as new columns
- `packages/domain/src/` — `LocalizedText`, `Slug`, `MoneyAmount`, `CurrencyValue` value-objects (reuse)
- `apps/admin/components/ui/` — shadcn primitives (Table, Sheet, Tabs, Badge, Button, Form, Switch, Sonner toast)

### Codebase maps

- `.planning/codebase/STRUCTURE.md` — repo layout
- `.planning/codebase/STACK.md` — tech versions (Next.js 16, React 19, Tailwind 4, shadcn new-york/neutral)
- `.planning/codebase/CONVENTIONS.md` — naming (`*-form-client.tsx`, action files, `apiFetch`)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`<EmptyState>` component (2 variants: `forbidden`, `empty`)** — для empty Items list, empty Categories list, empty Stop-list states.
- **`apps/admin/lib/api-server.ts:apiFetch`** — server-only HTTP клиент, проверен phase-3 фиксами (Set-Cookie forward → redirect order, parseSetCookie через split('=', 2)).
- **shadcn `Sheet` / `Tabs` / `Table` / `Badge` / `Switch` / `Sonner`** — все нужные примитивы уже установлены и используются в admin (workspace/settings/, brands/).
- **`apps/admin/components/app-sidebar.tsx`** — текущий sidebar с Dashboard/Brands/Settings; добавить `Menu` expandable group по образцу phase-02 patterns.
- **`packages/domain/src/{LocalizedText,Slug,MoneyAmount}`** — DTO value-objects, переиспользуются в catalog DTOs (уже подключены).
- **`apps/api/src/contexts/catalog/application/{upsert-category,upsert-item,upsert-modifier,publish-menu}.service.ts`** — application services, готовы для extension (новые поля БЖУ, stop-list endpoint, variants endpoint).
- **`apps/api/src/contexts/catalog/infrastructure/s3-signed-image-url.adapter.ts`** — presigned PUT URL generation, готов для CAT-03.
- **`apps/api/src/contexts/catalog/infrastructure/redis-catalog-cache.adapter.ts`** — published-menu cache, версии bumpятся при publish; CAT-10 (nextval fallback) добавляется здесь.

### Established Patterns

- **DDD + Hexagonal layout** (catalog имеет full domain/application/infrastructure/interfaces split). Не вводить новый bounded context — расширять existing.
- **Zod DTO source of truth + `createZodDto` для NestJS HTTP DTO + `z.infer` для TS типов** — добавлять `Bju` value-object в `packages/domain` и embedding в `UpsertItemInputSchema`.
- **`ScopedTx` + RLS double-enforcement** — все catalog write paths уже идут через ScopedTx.
- **Server actions в admin** (`*-action.ts` файлы) — для каждой mutation (upsert category, upsert item, toggle stop-list, publish, undo publish).
- **`*-form-client.tsx` для интерактивных форм** — `EditItemFormClient`, `EditCategoryFormClient`, `EditModifierFormClient`.
- **Publish flow** — текущий `publish-menu.service.ts` ВЕРСИОНИРУЕТ snapshot. Undo (5s window) требует "set published_version_id = previous" — application-level capability, snapshot store в БД остаётся iммутабелен.

### Integration Points

- **Customer surfaces (`apps/qr-menu`, `apps/website`)** — читают `/v1/menu` через `get-published-menu.service.ts`. Новые поля БЖУ должны попасть в Published menu schema → DTO → cache → public response. Эта связь — почему БЖУ structurированы (фильтры на QR-menu в фазе 6).
- **Audit context (`apps/api/src/contexts/audit/`)** — Publish/Stop-list изменения emit audit events (research: какие именно — `catalog.menu_published.v1`, `catalog.item_stopped.v1`, `catalog.item_unstopped.v1`).
- **Outbox + NATS** — events для publish/stop-list эмитятся через outbox (ADR-0020 I-6: используем `db.withTenantId` внутри service'а; никакого `runInTenantContext` вне HTTP middleware).
- **Better Auth org plugin** — `PermissionsGuard` уже работает на admin endpoints (phase-2). Catalog actions требуют `staff:menu:write` / `staff:menu:publish` permissions; researcher: подтвердить наличие этих permission tokens в `SYSTEM_ROLES` map.

</code_context>

<specifics>
## Specific Ideas

- **iiko как ориентир** — пользователь явно указал использовать iiko nomenclature model. Не 1:1, но взять "что хорошо". Это влияет на: terminology (Группа/Блюдо), entity boundaries (Размер vs variant), ТТК-style nutrition (мы это уже выбрали).
- **Visual hierarchy при editing item:** табы внутри `/menu/items/[id]` — `Detail` (default, name/price/category/photo/БЖУ/allergens/ingredients/status), `Variants` (sizes с per-variant ценами), `Modifiers` (assign modifier groups to item).
- **Status badges colors:** draft = outline-секондари, modified = warning-yellow outline, published = green default, 86'd = orange destructive, archived = grey ghost.
- **БЖУ fields layout:** в `Detail` табе одной строкой `[Б 0.0] [Ж 0.0] [У 0.0] [ккал 0]` под price, helper text "per 100g".
- **Sticky publish bar copy:** "**N unpublished changes** • [View list ▾] [Publish ↑]" — нажатие "View list" разворачивает inline список изменённых items.

</specifics>

<deferred>
## Deferred Ideas

### Multi-photo gallery (v2)

- Несколько фото per item с hero-slot. Требует new `item_photos` table или JSONB array на items. После первого платящего клиента, когда придёт реальный feedback от operator'ов.

### Multilingual editor (v2)

- Tabs для RU/EN/etc в редакторе LocalizedText полей. `LocalizedText` schema это уже поддерживает (Map locale→string), но UI пишет только default. Откладывается до запроса от клиента с мультиязычной аудиторией.

### Hierarchical categories (v2 — но iiko-research может рекомендовать в MVP-1)

- iiko `Группа` — это дерево. Наша current schema плоская. Researcher должен оценить trade-off: hierarchical обязателен сейчас, или MVP-1 ок с плоскими + миграция к hierarchical в v2 без боли?

### Bulk operations (v2)

- "Raise all prices by 10%", "Archive all items in category X", bulk stop-list toggle. Out of MVP-1 scope.

### Auto-reset stop-list at tenant-local 03:00 (v2)

- Cron-based reset stop-list по локальному tz tenant'а. Откладываем — операторы предпочитают manual control. Если feedback от пилотов скажет иначе, добавим в v2.

### Стоп-листы с reason (v2)

- iiko позволяет указать причину stop-list ("Out of stock", "Quality issue"). MVP-1 — простой on/off без reason. Research: насколько reason полезен операторам.

### Confirm modal перед publish (v2)

- Текущее решение — instant + undo. Если 5s undo окажется недостаточным safety net (например после реального инцидента "случайно опубликовал draft"), добавить per-tenant settings toggle "Require confirm on publish".

### Recipe / ТТК (v2)

- iiko Технико-Технологическая Карта (recipe + cost breakdown + yield). RestOS MVP-1 — только nutritional structured fields (БЖУ + ккал). ТТК как entity с ingredients-list + cost откладывается.

### Reviewed Todos (not folded)

None — discussion stayed within phase scope.

</deferred>

---

_Phase: 4-Catalog Admin_
_Context gathered: 2026-05-30_
