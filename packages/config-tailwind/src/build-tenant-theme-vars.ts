/** Structural subset of the domain TenantTheme / the public menu.tenant.theme DTO.
 * Kept local so this package stays free of @resto/domain coupling and works
 * with both shapes via structural typing. */
export interface TenantThemeInput {
  readonly primaryColor?: string | null;
  readonly font?: string | null;
}

const HEX = /^#(?:([\da-f]{3})|([\da-f]{6}))$/i;

const DARK_ON_PRIMARY = '#241100';
const LIGHT_ON_PRIMARY = '#ffffff';

const channelLuminance = (byte: number): number => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

const relativeLuminance = (hex: string): number | null => {
  const match = HEX.exec(hex);
  if (!match) return null;
  const full = match[1] ? [...match[1]].map((ch) => ch + ch).join('') : (match[2] ?? '');
  return (
    0.2126 * channelLuminance(parseInt(full.slice(0, 2), 16)) +
    0.7152 * channelLuminance(parseInt(full.slice(2, 4), 16)) +
    0.0722 * channelLuminance(parseInt(full.slice(4, 6), 16))
  );
};

const DARK_LUMINANCE = relativeLuminance(DARK_ON_PRIMARY) ?? 0;

/**
 * Map a tenant theme to the CSS custom properties that override the base
 * token contract (tokens.css / guest.css). Absent/null fields are omitted so the
 * base token stays in effect. `font` is intentionally NOT emitted: TenantTheme.font
 * has no charset allowlist yet (CSS-injection vector — see packages/domain/CLAUDE.md);
 * tenant-font injection is deferred until the allowlist lands with RES-91.
 *
 * `--primary-foreground` is derived, not themed: a tenant picking a pale brand colour
 * would otherwise inherit the near-black label the default orange wants, and one
 * picking a dark colour would inherit white — either way the label fails contrast.
 */
export function buildTenantThemeVars(theme: TenantThemeInput): Record<string, string> {
  const vars: Record<string, string> = {};
  if (!theme.primaryColor) return vars;

  vars['--primary'] = theme.primaryColor;

  const luminance = relativeLuminance(theme.primaryColor);
  if (luminance == null) return vars;

  const againstDark = (luminance + 0.05) / (DARK_LUMINANCE + 0.05);
  const againstLight = 1.05 / (luminance + 0.05);
  vars['--primary-foreground'] = againstDark >= againstLight ? DARK_ON_PRIMARY : LIGHT_ON_PRIMARY;

  return vars;
}
