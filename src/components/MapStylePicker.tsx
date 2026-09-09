/**
 * In-map style switcher — a small dropdown rendered as a pill in the
 * map's top toolbar. Applies per map instance.
 *
 * The actual style swap (calling `map.setStyle()` and re-adding custom
 * sources/layers) happens in each map component's `useEffect` that
 * watches the returned `style` value.
 */

import { useState } from "react";
import { Layers, Check, ChevronDown } from "lucide-react";
import { MAP_STYLES, type MapStyleId } from "@/lib/mapbox";

interface Props {
  value: MapStyleId;
  onChange: (s: MapStyleId) => void;
  /** Optional small variant for sidebar / read-only maps. */
  compact?: boolean;
}

export function MapStylePicker({ value, onChange, compact }: Props) {
  const [open, setOpen] = useState(false);
  const current = MAP_STYLES[value];

  return (
    <div className="pointer-events-auto relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Map type"
        className={`inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-card/95 shadow-md backdrop-blur transition hover:bg-secondary ${
          compact ? "px-2 py-1.5 text-xs" : "px-2.5 py-1.5 text-sm"
        } text-ink`}
      >
        <Layers className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {!compact && <span className="hidden sm:inline">{current.label}</span>}
        <ChevronDown className="h-3 w-3 text-muted-foreground" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-[450]"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-[460] mt-1 w-56 overflow-hidden rounded-xl border border-hairline bg-card shadow-xl">
            {(Object.keys(MAP_STYLES) as MapStyleId[]).map((id) => {
              const s = MAP_STYLES[id];
              const active = id === value;
              return (
                <button
                  key={id}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-start gap-2 border-b border-hairline px-3 py-2 text-left last:border-b-0 transition hover:bg-secondary ${
                    active ? "bg-secondary/60" : ""
                  }`}
                >
                  <div className="mt-0.5 h-3.5 w-3.5 shrink-0">
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink">{s.label}</div>
                    <div className="text-xs leading-snug text-muted-foreground">
                      {s.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
