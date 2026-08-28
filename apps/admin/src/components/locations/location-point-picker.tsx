import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface Point {
  readonly latitude: number;
  readonly longitude: number;
}

interface Props {
  readonly value: Point | null;
  readonly onChange: (point: Point, address?: string) => void;
  readonly addressHint: string;
}

interface NominatimHit {
  readonly lat: string;
  readonly lon: string;
  readonly display_name: string;
}

// Nominatim's usage policy asks for one request per second and an identifying UA. We honour the
// first with debounce-on-submit (search only fires on an explicit click, never per keystroke);
// the second is set by the browser and cannot be overridden from a page, which is why this is a
// search-on-demand box rather than an autocomplete.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const OSM_EMBED = 'https://www.openstreetmap.org/export/embed.html';

export function LocationPointPicker({ value, onChange, addressHint }: Props) {
  const [query, setQuery] = useState(addressHint);
  const [hits, setHits] = useState<readonly NominatimHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const search = useCallback(async () => {
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setError('Type at least three characters of the address.');
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setError(null);
    try {
      const url = `${NOMINATIM}?format=jsonv2&limit=5&q=${encodeURIComponent(trimmed)}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(String(res.status));
      setHits((await res.json()) as NominatimHit[]);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      // The picker must never be the reason a location cannot be saved — coordinates can still be
      // typed by hand below.
      setError('Address search is unavailable right now. Enter the coordinates directly.');
    } finally {
      setSearching(false);
    }
  }, [query]);

  const bbox = value
    ? [
        value.longitude - 0.004,
        value.latitude - 0.002,
        value.longitude + 0.004,
        value.latitude + 0.002,
      ].join(',')
    : null;

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="point-search">Find the address</Label>
        <div className="flex gap-2">
          <Input
            id="point-search"
            value={query}
            placeholder="Київ, вулиця Милославська 31"
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void search();
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={searching}
            onClick={() => void search()}
          >
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Search className="size-4" />
            )}
          </Button>
        </div>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>

      {hits.length > 0 ? (
        <ul className="divide-y rounded-md border text-sm">
          {hits.map((hit) => (
            <li key={`${hit.lat},${hit.lon}`}>
              <button
                type="button"
                className="hover:bg-muted/60 flex w-full items-start gap-2 px-3 py-2 text-left"
                onClick={() => {
                  onChange(
                    { latitude: Number(hit.lat), longitude: Number(hit.lon) },
                    hit.display_name,
                  );
                  setHits([]);
                }}
              >
                <MapPin className="mt-0.5 size-4 shrink-0" />
                <span>{hit.display_name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {value && bbox ? (
        <iframe
          title="Selected point"
          className="h-64 w-full rounded-md border"
          src={`${OSM_EMBED}?bbox=${bbox}&marker=${String(value.latitude)},${String(value.longitude)}`}
        />
      ) : (
        <div className="text-muted-foreground flex h-64 items-center justify-center rounded-md border border-dashed text-sm">
          No point selected yet
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="point-lat">Latitude</Label>
          <Input
            id="point-lat"
            inputMode="decimal"
            value={value ? String(value.latitude) : ''}
            onChange={(e) => {
              const lat = Number(e.target.value);
              if (!Number.isNaN(lat)) onChange({ latitude: lat, longitude: value?.longitude ?? 0 });
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="point-lng">Longitude</Label>
          <Input
            id="point-lng"
            inputMode="decimal"
            value={value ? String(value.longitude) : ''}
            onChange={(e) => {
              const lng = Number(e.target.value);
              if (!Number.isNaN(lng)) onChange({ latitude: value?.latitude ?? 0, longitude: lng });
            }}
          />
        </div>
      </div>
    </div>
  );
}
