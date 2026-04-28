import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

// HSV (h: 0-360, s: 0-1, v: 0-1) → hex
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const hp = (h % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0,
    g = 0,
    b = 0;
  if (0 <= hp && hp < 1) [r, g, b] = [c, x, 0];
  else if (1 <= hp && hp < 2) [r, g, b] = [x, c, 0];
  else if (2 <= hp && hp < 3) [r, g, b] = [0, c, x];
  else if (3 <= hp && hp < 4) [r, g, b] = [0, x, c];
  else if (4 <= hp && hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  const to = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
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

export function TopBarColorPicker({
  initial,
  onSaved,
}: {
  initial: string | null;
  onSaved: (hex: string) => void;
}) {
  const { user, activeEntityId } = useAuth();
  const startHsv = initial
    ? hexToHsv(initial) ?? { h: 210, s: 0.5, v: 1 }
    : { h: 210, s: 0.5, v: 1 };
  const [h, setH] = useState(startHsv.h);
  const [s, setS] = useState(startHsv.s);
  const [v, setV] = useState(startHsv.v);
  const [hexInput, setHexInput] = useState(initial ?? hsvToHex(startHsv.h, startHsv.s, startHsv.v));
  const [busy, setBusy] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  const currentHex = hsvToHex(h, s, v);

  useEffect(() => {
    setHexInput(currentHex);
  }, [currentHex]);

  const onCanvasDrag = (e: React.PointerEvent) => {
    const el = canvasRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const move = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      setS(x);
      setV(1 - y);
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
    const move = (clientY: number) => {
      const rect = el.getBoundingClientRect();
      const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      setH(y * 360);
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

  const applyHexInput = (val: string) => {
    setHexInput(val);
    const parsed = hexToHsv(val);
    if (parsed) {
      setH(parsed.h);
      setS(parsed.s);
      setV(parsed.v);
    }
  };

  const save = async () => {
    if (!user) return;
    setBusy(true);
    try {
      if (activeEntityId) {
        const { error } = await supabase
          .from("teams")
          .update({ top_bar_color: currentHex })
          .eq("id", activeEntityId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("profiles")
          .update({ top_bar_color: currentHex })
          .eq("id", user.id);
        if (error) throw error;
      }
      toast.success("Top bar color saved");
      onSaved(currentHex);
      window.dispatchEvent(new CustomEvent("topbar-color-changed", { detail: currentHex }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  // Pure-hue background for the SV canvas
  const hueColor = hsvToHex(h, 1, 1);

  return (
    <div className="border border-[#D4D4D4] bg-white p-4">
      <div className="flex gap-3">
        {/* Saturation × Value canvas */}
        <div
          ref={canvasRef}
          onPointerDown={onCanvasDrag}
          className="relative h-56 flex-1 cursor-crosshair touch-none border border-[#D4D4D4] select-none"
          style={{
            background: `
              linear-gradient(to top, #000, transparent),
              linear-gradient(to right, #fff, ${hueColor})
            `,
          }}
        >
          <div
            className="pointer-events-none absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{
              left: `${s * 100}%`,
              top: `${(1 - v) * 100}%`,
              boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
            }}
          />
        </div>

        {/* Hue strip */}
        <div
          ref={hueRef}
          onPointerDown={onHueDrag}
          className="relative h-56 w-5 cursor-pointer touch-none border border-[#D4D4D4] select-none"
          style={{
            background:
              "linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          }}
        >
          <div
            className="pointer-events-none absolute left-[-3px] right-[-3px] h-1 -translate-y-1/2 border border-black bg-white"
            style={{ top: `${(h / 360) * 100}%` }}
          />
        </div>
      </div>

      {/* Hex input */}
      <div className="mt-3 flex items-center gap-2">
        <label className="text-[11px] uppercase tracking-[0.18em] text-[#5C5C5C]">Hex</label>
        <input
          value={hexInput}
          onChange={(e) => applyHexInput(e.target.value)}
          spellCheck={false}
          className="flex-1 border border-[#D4D4D4] bg-[#FAFAFA] px-2 py-1.5 font-mono text-sm text-ink outline-none focus:border-ink"
        />
        <div
          className="h-7 w-10 border border-[#D4D4D4]"
          style={{ background: currentHex }}
          aria-label="Preview"
        />
      </div>

      {/* Save */}
      <div className="mt-3 flex justify-end">
        <button
          onClick={save}
          disabled={busy}
          className="border border-ink bg-ink px-4 py-1.5 text-xs font-medium text-background transition hover:opacity-90 disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
