import { describe, expect, it } from 'vitest';
import { contrastRatio, meetsContrast, readableForeground, relativeLuminance } from './contrast';

describe('contrastRatio', () => {
  it('measures the extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ff6900', '#ff6900')).toBeCloseTo(1, 5);
  });

  it('reads shorthand hex', () => {
    expect(contrastRatio('#fff', '#000')).toBeCloseTo(21, 1);
  });

  it('says nothing about a colour it cannot read', () => {
    expect(contrastRatio('rebeccapurple', '#ffffff')).toBeNull();
    expect(relativeLuminance('oklch(0.7 0.2 40)')).toBeNull();
  });
});

describe('readableForeground', () => {
  it('prints white on the brand orange', () => {
    expect(readableForeground('#ff6900')).toBe('#ffffff');
  });

  it('prints white on any deep colour', () => {
    expect(readableForeground('#1d4ed8')).toBe('#ffffff');
    expect(readableForeground('#0f172a')).toBe('#ffffff');
  });

  it('turns to ink on a pale one, where white would vanish', () => {
    expect(readableForeground('#ffd400')).toBe('#241100');
    expect(readableForeground('#f5f5dc')).toBe('#241100');
  });

  it('leaves an unreadable colour to the caller', () => {
    expect(readableForeground('not-a-colour')).toBeNull();
  });
});

describe('meetsContrast', () => {
  it('holds a picker to the body-text bar', () => {
    expect(meetsContrast('#ff6900', '#ffffff')).toBe(false);
    expect(meetsContrast('#ff6900', '#241100')).toBe(true);
  });

  it('takes the large-text bar when asked', () => {
    expect(meetsContrast('#e8590c', '#ffffff', 3)).toBe(true);
  });
});
