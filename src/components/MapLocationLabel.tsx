import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import type { LatLng } from "@/components/CourseMapEditor";

interface Props {
  point: LatLng | null;
}

// Simple in-memory cache so switching subevents doesn't re-fetch.
const cache = new Map<string, string>();

function cacheKey(p: LatLng) {
  // Round so nearby points share a cache slot.
  return `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
}

export function MapLocationLabel({ point }: Props) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    if (!point) {
      setLabel(null);
      return;
    }
    const key = cacheKey(point);
    if (cache.has(key)) {
      setLabel(cache.get(key)!);
      return;
    }
    let cancelled = false;
    setLabel(null);
    void (async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point[0]}&lon=${point[1]}&zoom=14&accept-language=en`,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) return;
        const data = await res.json();
        const a = data?.address ?? {};
        const place =
          a.neighbourhood ||
          a.suburb ||
          a.village ||
          a.town ||
          a.hamlet ||
          a.locality ||
          a.quarter ||
          a.borough ||
          a.city_district ||
          null;
        const city = a.city || a.town || a.municipality || a.county || null;
        const country = a.country || null;
        const parts = [place, city && city !== place ? city : null, country].filter(Boolean) as string[];
        const text = parts.length ? parts.join(", ") : (data?.display_name as string | undefined) ?? null;
        if (text) {
          cache.set(key, text);
          if (!cancelled) setLabel(text);
        }
      } catch {
        // ignore — label is optional
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [point ? cacheKey(point) : null]);

  if (!point) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-[400] flex max-w-[70%] items-center gap-1.5 rounded-md border border-hairline bg-card/95 px-2.5 py-1.5 text-xs text-ink shadow-md backdrop-blur">
      <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="truncate">{label ?? "Locating…"}</span>
    </div>
  );
}
