# Phase 4: Catalog Admin - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-30
**Phase:** 04-catalog-admin
**Areas discussed:** Catalog IA, Item Editor UX, Draft/Publish flow, Stop-list vs Archive, Schema redesign (iiko alignment), Scope split (Phase 04 vs 05)

---

## Catalog Information Architecture

### Q1: Sidebar placement

| Option                                                         | Description                                                     | Selected |
| -------------------------------------------------------------- | --------------------------------------------------------------- | -------- |
| Single 'Menu' item with nested tabs                            | One sidebar entry → tabs inside page                            |          |
| Top-level entries (Categories / Items / Modifiers / Stop-list) | Separate sidebar entries                                        |          |
| Menu with expandable sub-nav (accordion in sidebar)            | Hybrid: sidebar shows hierarchy when expanded, clean by default | ✓        |

**User's choice:** Menu с раскрывающимися дочерними
**Notes:** Default collapsed; full sub-nav доступен.

### Q2: Default list view for Items

| Option                             | Description                                             | Selected |
| ---------------------------------- | ------------------------------------------------------- | -------- |
| Cards with photo (grid)            | Visually similar to QR-menu                             |          |
| Compact table (thumb + fields)     | 48px thumb + name + category + price + status + actions | ✓        |
| Master-detail (list + right panel) | List left, details right                                |          |

**User's choice:** Таблица (thumb + поля)
**Notes:** Scan-friendly при 200+ позициях.

### Q3: Default filter for Items list

| Option                       | Description                            | Selected |
| ---------------------------- | -------------------------------------- | -------- |
| All statuses except archived | Draft + published + 86 visible         | ✓        |
| Published only by default    | Drafts hidden behind tab               |          |
| Grouped by category          | Table split into sections per category |          |

**User's choice:** Все позиции во всех статусах (кроме archived)

---

## Item Editor UX

### Q1: Editor surface

| Option                                     | Description                                                        | Selected |
| ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| Full page `/menu/items/[id]`               | Click row → navigate to editor; tabs inside for variants/modifiers | ✓        |
| Sheet / full-height drawer                 | Slide-in panel from right                                          |          |
| Hybrid: inline edits + 'Edit details' page | Inline quick edits + page for details                              |          |

**User's choice:** Полноценная страница

### Q2: Multilingual fields

| Option                                     | Description                                                 | Selected |
| ------------------------------------------ | ----------------------------------------------------------- | -------- |
| Language tabs (RU/EN/...) at top of editor | Switch view of all LocalizedText fields at once             |          |
| One field per language side-by-side        | name_ru + name_en visible together                          |          |
| MVP-1: only tenant's default locale        | LocalizedText kept, UI writes default only; multilang in v2 | ✓        |

**User's choice:** MVP-1: только основной язык tenant'а

### Q3: Nutrition info (БЖУ + ккал)

| Option                                                  | Description                                              | Selected |
| ------------------------------------------------------- | -------------------------------------------------------- | -------- |
| 4 numeric fields (proteins/fats/carbs/kcal) per 100g    | Structured; needs schema extension; aligns with iiko ТТК | ✓        |
| One free-text "Nutrition info" field                    | Operator writes whatever; no filters possible            |          |
| Defer BJU to v2 (only ingredients + allergens in MVP-1) | Shrink scope                                             |          |

**User's choice:** 4 числовых поля (Б / Ж / У / ккал) на 100г
**Notes:** Aligns with iiko ТТК structure; enables QR-menu filters in Phase 06.

### Q4: Photos per item

| Option                             | Description                                    | Selected |
| ---------------------------------- | ---------------------------------------------- | -------- |
| One main photo (current schema)    | Single imageS3Key                              | ✓        |
| Gallery (up to 5 photos) with hero | Multi-photo with primary                       |          |
| 1 photo + v2 slot ready in schema  | One photo now, schema pre-prepares for gallery |          |

**User's choice:** Одно главное фото (current schema)

---

## Draft / Publish UX

### Q1: When are draft edits saved?

| Option                                  | Description                                                                | Selected |
| --------------------------------------- | -------------------------------------------------------------------------- | -------- |
| Explicit 'Save draft' button            | Edits lost on navigate-away without save; unsaved-changes warning required | ✓        |
| Auto-save with ~1s debounce             | Status indicator "Saving..."; no Save button                               |          |
| Auto-save + explicit 'Discard' in toast | Hybrid: auto-save + undo toast                                             |          |

**User's choice:** Явный 'Save draft' кнопкой

### Q2: Where does the draft-vs-published diff live? (CAT-08)

| Option                                     | Description                                                        | Selected |
| ------------------------------------------ | ------------------------------------------------------------------ | -------- |
| Modal before publish with change list      | Click Publish → modal "Will publish: 3 changed, 1 new, 2 archived" |          |
| Separate page `/menu/preview`              | Dedicated diff page, side-by-side or unified                       |          |
| Status badges per row + sticky publish bar | Per-item badges + bottom bar "N unpublished changes → Publish"     | ✓        |

**User's choice:** Status badge в таблице + sticky publish bar
**Notes:** CAT-08 satisfied via visual indicators (badges) rather than dedicated diff view.

### Q3: Publish confirmation behavior

| Option                                      | Description                                        | Selected |
| ------------------------------------------- | -------------------------------------------------- | -------- |
| Confirm modal with short change list        | Click Publish → confirm modal; the diff lives here |          |
| Instant + 5s undo toast                     | Immediate publish; toast "Published. Undo (5s)"    | ✓        |
| Confirm + 'Don't ask again in this session' | First-time confirm; can disable per session        |          |

**User's choice:** Инстантно + undo-toast 5с
**Notes:** Implies backend capability "revert to previous snapshot" within 5s window.

---

## Stop-list vs Archive

### Q1: Stop-list toggle placement

| Option                                                 | Description                                       | Selected |
| ------------------------------------------------------ | ------------------------------------------------- | -------- |
| Inline toggle in table row (1 click)                   | Stop column with switch                           |          |
| Separate 'Stop-list' screen in sidebar                 | Menu → Stop-list page with checkboxes             |          |
| Both: inline toggle + 'Today's 86' widget on Dashboard | Quick access + visible-at-a-glance widget on home | ✓        |

**User's choice:** Оба: inline toggle + виджет 'Today's 86' на dashboard

### Q2: Stop-list reset behavior

| Option                             | Description                                            | Selected |
| ---------------------------------- | ------------------------------------------------------ | -------- |
| Manual reset (toggle off)          | Persists across days until operator unsets             | ✓        |
| Auto-reset at tenant-local 03:00   | Cron with tenant tz                                    |          |
| 'Reset all' option + manual toggle | Manual toggle + 'Reset all' button on dashboard widget |          |

**User's choice:** Ручной сброс (toggle off)
**Notes:** No cron complexity; operator's explicit control preferred when shortage spans >1 day.

---

## Schema Redesign — iiko Alignment

### User's intent (free-form)

User said (translated from Russian):

> "We can look at how the product and its related entities and categories are structured in iiko docs — they have everything well thought-out. To make future integration easier we don't have to do it exactly but borrow what's good."

User provided canonical URL:

> `https://ru.iiko.help/articles/#!api-documentations/elementy-nomenklatury`

User then said:

> "Then let's fully revisit the nomenclature groups, that is, our menu, and rebuild fields for all items."
>
> "Yes, and this will be a menu layer that needs to be applied on api, admin AND web."

**Decision captured:** Phase 04 explicitly takes on schema redesign as foundational work, not just UI/admin layer over existing catalog schema. Researcher must read iiko nomenclature docs (or open-source iiko SDKs as proxy) BEFORE producing RESEARCH.md, build an `04-SCHEMA-MAP.md` mapping iiko entities to RestOS entities, and propose a target Drizzle schema.

Pre-existing UX decisions (D-01..D-13) may need revision once schema is final — planner flags "schema-may-affect-UI" and user reconfirms before execution.

---

## Scope Split (Phase 04 vs Phase 05)

| Option                                                        | Description                                                    | Selected |
| ------------------------------------------------------------- | -------------------------------------------------------------- | -------- |
| Phase 04 = schema + API + admin. Phase 05 = web render        | Clean layering; apps/website consumes new /v1/menu in Phase 05 | ✓        |
| Phase 04 all-in-one: schema + API + admin + website + qr-menu | One big PR, all menu reform together; high risk of bloat       |          |
| Phase 04 = schema + API + admin + extend public /v1/menu DTO  | Phase 04 outputs schema-rich /v1/menu; Phase 05/06 just render |          |

**User's choice:** Фаза 04 = schema + API + admin. Фаза 05 = web рендер
**Notes:** /v1/menu DTO inherits new fields automatically — Phase 05 just renders.

---

## Claude's Discretion

- Concrete shadcn `Badge` variants per status (outline / default / destructive / secondary / ghost)
- Toast library (Sonner already in shadcn pack)
- Sticky bar exact positioning (viewport-fixed vs content-area-bottom)
- Photo upload drag-drop library (react-dropzone vs native HTML5)
- Specific UI copy strings (researcher / planner will draft; user can revise during execution)

## Deferred Ideas

- **Multi-photo gallery** — v2, after first paying customers feedback
- **Multilingual editor tabs** — v2, until tenant requests
- **Hierarchical categories** — v2 unless iiko-research flags it as MVP-1 must
- **Bulk operations** — v2 (price adjustment, bulk archive, bulk stop-list)
- **Auto-reset stop-list at 03:00** — v2 if pilot feedback requests
- **Stop-list with reason** — v2 (iiko supports; MVP-1 plain on/off)
- **Confirm modal before publish** — v2 toggle per tenant if undo 5s proves insufficient
- **Full ТТК (recipe / ingredients / cost breakdown)** — v2 (MVP-1 ships structured nutrition only)
