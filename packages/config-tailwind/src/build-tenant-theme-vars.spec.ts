import { describe, expect, it } from 'vitest';
import { buildTenantThemeVars } from './build-tenant-theme-vars';

describe('buildTenantThemeVars', () => {
  it('maps primaryColor to the --primary CSS variable', () => {
    expect(buildTenantThemeVars({ primaryColor: '#ff0000' })).toMatchObject({
      '--primary': '#ff0000',
    });
  });

  it('pairs a light brand colour with the dark label', () => {
    expect(buildTenantThemeVars({ primaryColor: '#ffd400' })['--primary-foreground']).toBe(
      '#241100',
    );
  });

  it('pairs a dark brand colour with the white label', () => {
    expect(buildTenantThemeVars({ primaryColor: '#1d4ed8' })['--primary-foreground']).toBe(
      '#ffffff',
    );
  });

  it('keeps the white label on a brand orange, the way a restaurant prints it', () => {
    expect(buildTenantThemeVars({ primaryColor: '#ff6900' })['--primary-foreground']).toBe(
      '#ffffff',
    );
  });

  it('expands shorthand hex before measuring contrast', () => {
    expect(buildTenantThemeVars({ primaryColor: '#fd0' })['--primary-foreground']).toBe('#241100');
  });

  it('omits the derived label when the colour is not parseable hex', () => {
    expect(buildTenantThemeVars({ primaryColor: 'rebeccapurple' })).toEqual({
      '--primary': 'rebeccapurple',
    });
  });

  it('omits the variable when primaryColor is null', () => {
    expect(buildTenantThemeVars({ primaryColor: null })).toEqual({});
  });

  it('omits the variable when primaryColor is absent', () => {
    expect(buildTenantThemeVars({})).toEqual({});
  });

  it('never emits a tenant font (deferred until allowlist)', () => {
    expect(
      buildTenantThemeVars({ primaryColor: '#ff0000', font: 'Comic Sans' }),
    ).not.toHaveProperty('--font-brand');
  });
});
