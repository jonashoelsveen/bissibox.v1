/**
 * SessionPopoverEditor — Notion-style inline popover for adding/editing
 * a single session item. Includes the platform color row (8 dots, 4×2)
 * so users can colorize sessions. Shared by Type 1 and Type 3 grids.
 */

import { useEffect, useRef, useState } from "react";
import { GROUP_COLOR_PALETTE } from "../GroupColorPicker";
import { computePopoverPosition } from "./popoverPosition";

export interface SessionPopoverEditorProps {
  initialText: string;
  initialColor: string | null;
  isEdit: boolean;
  anchor: DOMRect;
  /** Optional time range label shown above the input (e.g. "08:00 – 09:30"). */
  timeLabel?: string;
  onClose: () => void;
  onCommit: (text: string, color: string | null) => void;
}

export function SessionPopoverEditor({
  initialText,
  initialColor,
  isEdit,
  anchor,
  timeLabel,
  onClose,
  onCommit,
}: SessionPopoverEditorProps) {
  const [value, setValue] = useState(initialText);
  const [color, setColor] = useState<string | null>(initialColor);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) {
        onCommit(value.trim(), color);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        onCommit(value.trim(), color);
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [value, color, onCommit, onClose]);

  const POPOVER_W = 280;
  const POPOVER_H = timeLabel ? 200 : 170;
  const { top, left } = computePopoverPosition(anchor, POPOVER_W, POPOVER_H);

  return (
    <div
      ref={ref}
      className="fixed z-50 overflow-hidden rounded-md border border-ink/15 bg-card shadow-lg"
      style={{ top, left, width: POPOVER_W }}
    >
      <div className="flex items-center justify-between border-b border-hairline px-3 py-2">
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {isEdit ? "Rediger økt" : "Legg til økt"}
        </span>
        {timeLabel && (
          <span className="mono text-[10.5px] tabular-nums text-ink/70">
            {timeLabel}
          </span>
        )}
      </div>
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="f.eks. Intervaller 5×4min"
        className="block w-full bg-transparent px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-2">
        <span className="mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
          Farge
        </span>
        <div className="grid grid-cols-4 gap-1.5">
          {GROUP_COLOR_PALETTE.map((c) => {
            const selected = color?.toLowerCase() === c.value.toLowerCase();
            return (
              <button
                key={c.value}
                type="button"
                title={c.name}
                aria-label={c.name}
                aria-pressed={selected}
                onClick={() => setColor(selected ? null : c.value)}
                className={[
                  "h-3 w-3 rounded-full border transition-transform hover:scale-125",
                  selected
                    ? "border-ink/70 ring-2 ring-ink/30 ring-offset-1 ring-offset-card"
                    : "border-black/15",
                ].join(" ")}
                style={{ background: c.value }}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
        <span className="mono tabular-nums">
          {isEdit ? "⏎ for å lagre · tøm for å slette" : "⏎ for å lagre"}
        </span>
        <button
          type="button"
          onClick={() => onCommit(value.trim(), color)}
          className="rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-primary-foreground hover:opacity-90"
        >
          {isEdit ? "Lagre" : "Legg til"}
        </button>
      </div>
    </div>
  );
}

const COLOR_PREFIX_RE = /^\[(#[0-9a-fA-F]{6})\]\s*/;
export function splitColor(raw: string): { color: string | null; text: string } {
  const m = raw.match(COLOR_PREFIX_RE);
  if (m) return { color: m[1], text: raw.slice(m[0].length) };
  return { color: null, text: raw };
}
export function joinColor(color: string | null, text: string): string {
  return color ? `[${color}] ${text}` : text;
}

const TIME_PREFIX_RE = /^<(\d{2}):(\d{2})-(\d{2}):(\d{2})>\s*/;
export function splitTime(
  raw: string,
): { time: { startMin: number; endMin: number } | null; text: string } {
  const m = raw.match(TIME_PREFIX_RE);
  if (m) {
    const startMin = parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    const endMin = parseInt(m[3], 10) * 60 + parseInt(m[4], 10);
    return { time: { startMin, endMin }, text: raw.slice(m[0].length) };
  }
  return { time: null, text: raw };
}
export function joinTime(
  time: { startMin: number; endMin: number } | null,
  text: string,
): string {
  if (!time) return text;
  const fmt = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  return `<${fmt(time.startMin)}-${fmt(time.endMin)}> ${text}`;
}

export function fmtMin(m: number): string {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
