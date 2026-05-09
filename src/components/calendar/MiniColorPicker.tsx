import { useEffect, useRef, useState } from "react";

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (0 <= hp && hp < 1) [r, g, b] = [c, x, 0];
  else if (1 <= hp && hp < 2) [r, g, b] = [x, c, 0];
  else if (2 <= hp && hp < 3) [r, g, b] = [0, c, x];
  else if (3 <= hp && hp < 4) [r, g, b] = [0, x, c];
  else if (4 <= hp && hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

function hexToHsv(hex: string): { h: number; s: number; v: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

export function MiniColorPicker({
  initial,
  onSave,
  onPreview,
}: {
  initial: string;
  onSave: (hex: string) => void;
  onPreview?: (hex: string) => void;
}) {
  const start = hexToHsv(initial) ?? { h: 210, s: 0.5, v: 1 };
  const [h, setH] = useState(start.h);
  const [s, setS] = useState(start.s);
  const [v, setV] = useState(start.v);
  const [hexInput, setHexInput] = useState(initial);
  const canvasRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const currentHex = hsvToHex(h, s, v);

  useEffect(() => {
    setHexInput(currentHex);
    onPreview?.(currentHex);
  }, [currentHex, onPreview]);

  const onCanvasDrag = (e: React.PointerEvent) => {
    const el = canvasRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const move = (cx: number, cy: number) => {
      const r = el.getBoundingClientRect();
      setS(Math.max(0, Math.min(1, (cx - r.left) / r.width)));
      setV(1 - Math.max(0, Math.min(1, (cy - r.top) / r.height)));
    };
    move(e.clientX, e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientX, ev.clientY);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const onHueDrag = (e: React.PointerEvent) => {
    const el = hueRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const move = (cy: number) => {
      const r = el.getBoundingClientRect();
      setH(Math.max(0, Math.min(1, (cy - r.top) / r.height)) * 360);
    };
    move(e.clientY);
    const onMove = (ev: PointerEvent) => move(ev.clientY);
    const onUp = () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
  };

  const applyHex = (val: string) => {
    setHexInput(val);
    const p = hexToHsv(val);
    if (p) { setH(p.h); setS(p.s); setV(p.v); }
  };

  const hueColor = hsvToHex(h, 1, 1);

  return (
    <div
      className="border border-hairline bg-popover p-3 shadow-lg"
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onSave(currentHex); }
      }}
    >
      <div className="flex gap-2">
        <div
          ref={canvasRef}
          onPointerDown={onCanvasDrag}
          className="relative h-32 w-32 cursor-crosshair touch-none border border-hairline"
          style={{
            background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hueColor})`,
          }}
        >
          <div
            className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{ left: `${s * 100}%`, top: `${(1 - v) * 100}%`, boxShadow: "0 0 0 1px rgba(0,0,0,0.5)" }}
          />
        </div>
        <div
          ref={hueRef}
          onPointerDown={onHueDrag}
          className="relative h-32 w-3.5 cursor-pointer touch-none border border-hairline"
          style={{ background: "linear-gradient(to bottom, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)" }}
        >
          <div
            className="pointer-events-none absolute -left-[2px] -right-[2px] h-1 -translate-y-1/2 border border-black bg-white"
            style={{ top: `${(h / 360) * 100}%` }}
          />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <input
          autoFocus
          value={hexInput}
          onChange={(e) => applyHex(e.target.value)}
          spellCheck={false}
          className="h-7 flex-1 border border-hairline bg-card px-1.5 font-mono text-[11px] outline-none focus:border-ink"
        />
        <div className="h-7 w-7 border border-hairline" style={{ background: currentHex }} />
      </div>
      <div className="mt-2 flex justify-end">
        <button
          onClick={() => onSave(currentHex)}
          className="border border-ink bg-ink px-3 py-1 text-[11px] font-medium text-background hover:opacity-90"
        >
          Save
        </button>
      </div>
    </div>
  );
}

// 8 default swatches: S=100%, L=68%
export const DEFAULT_SWATCHES = [0, 45, 90, 135, 180, 225, 270, 315].map((hue) => {
  // HSL → hex
  const s = 1, l = 0.68;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (0 <= hp && hp < 1) [r, g, b] = [c, x, 0];
  else if (1 <= hp && hp < 2) [r, g, b] = [x, c, 0];
  else if (2 <= hp && hp < 3) [r, g, b] = [0, c, x];
  else if (3 <= hp && hp < 4) [r, g, b] = [0, x, c];
  else if (4 <= hp && hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  const to = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
});
