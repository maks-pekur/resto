import { describe, expect, it } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { VenueGallery } from '../src/components/VenueGallery';

const photos = [
  'https://cdn.test/hall.jpg',
  'https://cdn.test/bar.jpg',
  'https://cdn.test/room.jpg',
];

describe('VenueGallery', () => {
  it('renders every photo the venue published', () => {
    const { container } = render(<VenueGallery photos={photos} />);

    expect(container.querySelectorAll('img')).toHaveLength(3);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(photos[0]);
  });

  it('marks which photo the guest is on', () => {
    const { container } = render(<VenueGallery photos={photos} />);
    const dots = () => Array.from(container.querySelectorAll('span.rounded-full.bg-white'));

    expect(dots()[0]?.className).toContain('w-4');

    const track = container.querySelector('div.snap-x');
    if (!track) throw new Error('no track');
    Object.defineProperty(track, 'clientWidth', { value: 400, configurable: true });
    track.scrollLeft = 800;
    fireEvent.scroll(track);

    expect(dots()[2]?.className).toContain('w-4');
  });

  it('leaves the dots off a single photo, and renders nothing at all for none', () => {
    const one = render(<VenueGallery photos={[photos[0] ?? '']} />);
    expect(one.container.querySelectorAll('img')).toHaveLength(1);
    expect(one.container.querySelectorAll('span.rounded-full.bg-white')).toHaveLength(0);
    one.unmount();

    const { container } = render(<VenueGallery photos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
