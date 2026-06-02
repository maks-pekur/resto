# i18n — admin app

Operator UI strings are localized via [`next-intl`](https://next-intl.dev/). Only two locales are wired today: `ru` (default) and `en`.

## Layout

```
lib/i18n/
├── README.md             # this file
├── locales.ts            # LOCALES tuple + DEFAULT_LOCALE + LOCALE_COOKIE_NAME
├── locale-cookie.ts      # resolveLocale() — cookie → Accept-Language → default
├── messages-index.ts     # MESSAGES map keyed by Locale
├── request.ts            # next-intl request-side config (App Router)
├── set-locale-action.ts  # server action — writes resto.locale cookie
└── messages/
    ├── ru.json           # source of truth for content
    └── en.json           # English mirror; keys MUST match ru.json 1:1
```

The provider is mounted in `app/layout.tsx` via `NextIntlClientProvider`.

## Locale resolution

`resolveLocale()` runs on every request:

1. Read the `resto.locale` cookie. If present and valid, use it.
2. Else parse `Accept-Language` and pick the first known locale.
3. Else fall back to `DEFAULT_LOCALE` (`ru`).

The cookie is `httpOnly`, `sameSite=lax`, `secure` in production, and lives 1 year.

The operator toggles the active locale from the NavUser dropdown
(`components/locale-switcher-items.tsx`). It calls `setLocaleAction`,
which writes the cookie and revalidates the layout — the next render
picks up the new locale.

## Catalog structure

Keys are grouped by domain, with shared bits in `common.*`:

```jsonc
{
  "common":    { "save": "...", "cancel": "..." },
  "auth":      { ... },
  "nav":       { "menu": "...", "user": { "logout": "..." } },
  "menu": {
    "items":          { /* list page + item CRUD */ },
    "editor":         { /* item editor form */ },
    "sizes":          { ... },
    "modifiers":      { /* item modifiers tab */ },
    "modifierGroups": { /* modifier-groups list/editor */ },
    "categories":     { ... },
    "stopList":       { ... },
    "publishBar":     { /* sticky publish bar + countdown toast */ },
    "status":         { "draft": "...", "ariaLabel": "..." }
  },
  "dashboard": { ... },
  "format":    { "ago": "..." }
}
```

When a string appears once and is local to one component, namespace it under that
component's owning surface. When the same string is reused across surfaces, lift
it to `common.*`.

## Adding a key

1. Add the entry to **both** `ru.json` and `en.json` under the same path.
2. Consume in components:

   ```tsx
   // client component
   import { useTranslations } from 'next-intl';
   const t = useTranslations('menu.editor');
   <Button>{t('saveBtn')}</Button>;

   // server component / server action
   import { getTranslations } from 'next-intl/server';
   const t = await getTranslations('menu.editor');
   ```

3. Run `pnpm tsc --noEmit` + `pnpm vitest run` from `apps/admin/` to verify nothing broke.

## ICU placeholders

next-intl uses ICU MessageFormat.

Simple substitution:

```json
"chipRemoveAriaLabel": "Убрать группу {name}"
```

```tsx
t('chipRemoveAriaLabel', { name: g.name });
```

Russian plurals (one / few / many / other):

```json
"unpublishedChanges": "{count, plural, one {# неопубликованное изменение} few {# неопубликованных изменения} many {# неопубликованных изменений} other {# неопубликованных изменений}}"
```

```tsx
t('unpublishedChanges', { count: 3 }); // → "3 неопубликованных изменения"
```

`#` inside a plural branch renders the count without re-quoting it as a variable.

## Adding a locale

1. Add the code to the `LOCALES` tuple in `locales.ts`.
2. Drop `messages/<code>.json` mirroring `ru.json` 1:1.
3. Import it in `messages-index.ts` and add it to the `MESSAGES` map.
4. Add the display label to `nav.user` (`localeXx: "..."` key) in every existing catalog.

`negotiateFromAcceptLanguage` will pick it up automatically.

## Testing

Tests run inside JSDOM and **do not** load the live next-intl provider.
`test/setup.ts` ships a global mock that:

- resolves translations from the real `ru.json` (so tests still assert against
  user-visible text);
- supports `{var}` substitution and ICU plural categories via `Intl.PluralRules`;
- pins `useLocale()` to `'ru'`.

If a test exercises `setLocaleAction` or any other `'use server'` module that
imports `next/headers`, mock it with `vi.mock(...)` — see
`test/nav-user.spec.tsx` for the pattern.

## Gotchas

- **Server components.** `useTranslations` only works in client components.
  Server components use `await getTranslations(ns)`. Mixing them up is a runtime
  error, not a compile error.
- **`menu.items` vs `menu.editor`.** `menu.items` is the items LIST surface
  (table, filters, archive dialog). `menu.editor` is the SINGLE-item editor.
  Don't fold them.
- **`menu.modifiers` vs `menu.modifierGroups`.** `menu.modifiers` is the _tab_
  on an item that attaches groups. `menu.modifierGroups` is the standalone
  groups list/editor.
- **Role labels.** `NavUser` renders `baseRole` (Owner / Admin / Staff) as
  English-capitalized — these are technical identifiers, not translated strings.
- **`ai-preview-card`.** Locked per CONTEXT D-17 — Russian header + English body
  regardless of locale. Do not translate it.
