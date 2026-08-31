import { readableForeground } from './contrast';

/** Structural subset of the domain TenantTheme / the public menu.tenant.theme DTO.
 * Kept local so this package stays free of @resto/domain coupling and works
 * with both shapes via structural typing. */
export interface TenantThemeInput {
  readonly primaryColor?: string | null;
  readonly font?: string | null;
}

/**
 * Map a tenant theme to the CSS custom properties that override the base
 * token contract (tokens.css / guest.css). Absent/null fields are omitted so the
 * base token stays in effect. `font` is intentionally NOT emitted: TenantTheme.font
 * has no charset allowlist yet (CSS-injection vector — see packages/domain/CLAUDE.md);
 * tenant-font injection is deferred until the allowlist lands with RES-91.
 *
 * `--primary-foreground` is derived, not themed: a tenant picking a pale brand colour would
 * otherwise inherit the white label a deep one wants, and be unreadable. See `contrast.ts`.
 */
export function buildTenantThemeVars(theme: TenantThemeInput): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!theme.primaryColor) return vars;

  vars['--primary'] = theme.primaryColor;

  const label = readableForeground(theme.primaryColor);
  if (label !== null) vars['--primary-foreground'] = label;

  return vars;
}
