import { describe, expect, it } from 'vitest';
import { buildTenantThemeVars } from './build-tenant-theme-vars';

describe('buildTenantThemeVars', () => {
  it('maps primaryColor to the --primary CSS variable', () => {
    expect(buildTenantThemeVars({ primaryColor: '#ff0000' })).toEqual({ '--primary': '#ff0000' });
  });

  it('omits the variable when primaryColor is null', () => {
    expect(buildTenantThemeVars({ primaryColor: null })).toEqual({});
  });

  it('omits the variable when primaryColor is absent', () => {
    expect(buildTenantThemeVars({})).toEqual({});
  });

  it('never emits a tenant font (deferred until allowlist)', () => {
    expect(buildTenantThemeVars({ primaryColor: '#ff0000', font: 'Comic Sans' })).toEqual({
      '--primary': '#ff0000',
    });
  });
});
