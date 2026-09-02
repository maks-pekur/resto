import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(
  resolve(process.cwd(), '../../packages/config-tailwind/guest.css'),
  'utf8',
);

describe('the page under a sheet', () => {
  it('reserves the scrollbar gutter so locking the scroll cannot resize the page', () => {
    expect(css).toContain('scrollbar-gutter: stable');
  });

  it('outweighs the scroll-lock compensation instead of racing it', () => {
    // react-remove-scroll injects `body[data-scroll-locked]{padding-right:…!important}` at open
    // time — later in the cascade than ours, so ours has to win on specificity.
    expect(css).toMatch(/html body\[data-scroll-locked\][^}]*padding-right: 0 !important/s);
    expect(css).toMatch(/html body\.with-scroll-bars-hidden[^}]*padding-right: 0 !important/s);
  });
});

describe('the phone-first breakpoint', () => {
  it('names an `xs` step below Tailwind default, so 320px is the base and not an afterthought', () => {
    const preset = readFileSync(
      resolve(process.cwd(), '../../packages/config-tailwind/preset.css'),
      'utf8',
    );

    expect(preset).toMatch(/--breakpoint-xs:\s*22\.5rem/);
  });
});
