import { useRef, useState } from 'react';

export interface VenueGalleryProps {
  readonly photos: readonly string[];
}

/**
 * The room, swiped rather than paged: scroll snapping is the browser's own gesture, so it
 * follows the finger exactly and costs no library. Dots report where the guest is.
 */
export const VenueGallery = ({ photos }: VenueGalleryProps) => {
  const track = useRef<HTMLDivElement | null>(null);
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) return null;

  return (
    <div className="relative shrink-0">
      <div
        ref={track}
        onScroll={(event) => {
          const { scrollLeft, clientWidth } = event.currentTarget;
          setCurrent(clientWidth === 0 ? 0 : Math.round(scrollLeft / clientWidth));
        }}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {photos.map((photo) => (
          <img
            key={photo}
            src={photo}
            alt=""
            className="bg-muted aspect-[16/9] w-full shrink-0 snap-center rounded-t-2xl object-cover"
          />
        ))}
      </div>

      {photos.length > 1 ? (
        <div aria-hidden className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {photos.map((photo, index) => (
            <span
              key={photo}
              className={`h-1.5 rounded-full bg-white transition-all ${
                index === current ? 'w-4 opacity-100' : 'w-1.5 opacity-60'
              }`}
            />
          ))}
        </div>
      ) : null}

      <span
        aria-hidden
        className="absolute inset-x-0 top-3 mx-auto h-1.5 w-10 rounded-full bg-white/70 shadow-sm"
      />
    </div>
  );
};
