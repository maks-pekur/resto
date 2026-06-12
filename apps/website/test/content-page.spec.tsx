import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ContentPage } from '@/components/content-page';
import { getSeededContent, type ContentPageKey } from '@/lib/content';

describe('ContentPage', () => {
  it('splits the body into paragraphs and drops blank lines', () => {
    render(<ContentPage heading="Heading" body={'one\n\ntwo\n  \nthree'} />);
    expect(screen.getByText('one')).toBeDefined();
    expect(screen.getByText('two')).toBeDefined();
    expect(screen.getByText('three')).toBeDefined();
    expect(screen.getAllByText(/^(one|two|three)$/).length).toBe(3);
  });

  it('renders the heading as a heading element', () => {
    render(<ContentPage heading="My Heading" body="x" />);
    expect(screen.getByRole('heading', { name: 'My Heading' })).toBeDefined();
  });
});

describe('getSeededContent', () => {
  const keys: ContentPageKey[] = ['about', 'delivery', 'contact', 'faq'];

  it('returns a non-empty heading and body for every key', () => {
    for (const key of keys) {
      const content = getSeededContent(key, 'Pizza Place');
      expect(content.heading.length).toBeGreaterThan(0);
      expect(content.body.length).toBeGreaterThan(0);
    }
  });

  it('interpolates the restaurant name', () => {
    expect(getSeededContent('about', 'Pizza Place').heading).toContain('Pizza Place');
  });
});
