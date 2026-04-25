import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

// 8 retro-style colors arranged clockwise from 1 o'clock
export const GROUP_COLOR_PALETTE: { name: string; value: string }[] = [
  { name: "Vivid Red", value: "#E63337" },        // 1
  { name: "Bright Orange", value: "#F09B0A" },    // 2
  { name: "Golden Yellow", value: "#FFCD33" },    // 4
  { name: "Emerald Green", value: "#26B270" },    // 5
  { name: "Sky Blue", value: "#17A4E0" },         // 7
  { name: "Royal Blue", value: "#1960C4" },       // 8
  { name: "Purple", value: "#A22CC8" },           // 10
  { name: "Magenta", value: "#D22551" },          // 11
];

// Convert hex → rgba with alpha
export function hexToRgba(hex: string, alpha: number) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Color wheel icon — 8 colored pie segments.
 * Segments are aligned to the clock positions: 1, 2, 4, 5, 7, 8, 10, 11.
 * Each segment spans 45° centered on its clock position.
 */
export function ColorWheelIcon({ size = 18 }: { size?: number }) {
  const cx = 12;
  const cy = 12;
  const r = 11;
  // Clock positions in degrees (0° = 12 o'clock, increasing clockwise)
  // 1=30, 2=60, 4=120, 5=150, 7=210, 8=240, 10=300, 11=330
  const centers = [30, 60, 120, 150, 210, 240, 300, 330];
  const half = 22.5; // segments span 45°

  const polar = (deg: number) => {
    // SVG: 0° up, clockwise
    const rad = ((deg - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {centers.map((c, i) => {
        const start = c - half;
        const end = c + half;
        const [x1, y1] = polar(start);
        const [x2, y2] = polar(end);
        const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
        return <path key={i} d={d} fill={GROUP_COLOR_PALETTE[i].value} />;
      })}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="0.75" />
    </svg>
  );
}

export function GroupColorPicker({
  color,
  onChange,
  label = "Color",
}: {
  color: string;
  onChange: (c: string) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Pick group color"
          className="flex h-[38px] w-full items-center justify-between gap-2 rounded-md border border-hairline bg-background px-3 text-sm text-ink outline-none transition hover:border-primary focus:border-primary"
        >
          <span className="flex items-center gap-2">
            {color ? (
              <span
                className="inline-block h-4 w-4 rounded-sm border border-black/10"
                style={{ background: color }}
              />
            ) : (
              <ColorWheelIcon size={18} />
            )}
            <span className="text-xs text-muted-foreground">
              {color
                ? GROUP_COLOR_PALETTE.find((c) => c.value.toLowerCase() === color.toLowerCase())?.name ?? "Custom"
                : "None"}
            </span>
          </span>
          <ColorWheelIcon size={16} />
        </button>
        {open && (
          <div className="absolute right-0 top-[42px] z-20 w-[208px] rounded-md border border-hairline bg-card p-2 shadow-lg">
            <p className="mb-1.5 px-1 mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              Color
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                title="None"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="relative flex h-8 w-8 items-center justify-center rounded-sm border border-hairline transition hover:scale-105"
                style={{
                  backgroundImage:
                    "linear-gradient(135deg, transparent 45%, rgba(120,120,120,0.6) 45%, rgba(120,120,120,0.6) 55%, transparent 55%)",
                }}
              >
                {!color && <Check className="h-3.5 w-3.5 text-ink" />}
              </button>
              {GROUP_COLOR_PALETTE.map((c) => {
                const selected = c.value.toLowerCase() === (color || "").toLowerCase();
                return (
                  <button
                    key={c.value}
                    type="button"
                    title={c.name}
                    onClick={() => {
                      onChange(c.value);
                      setOpen(false);
                    }}
                    className="relative flex h-8 w-8 items-center justify-center rounded-sm border border-black/10 transition hover:scale-105"
                    style={{ background: c.value }}
                  >
                    {selected && <Check className="h-4 w-4 text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
